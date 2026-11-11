"use client";

import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
} from "@supabase/supabase-js";
import Link from "next/link";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { Avatar } from "@/components/avatar";
import {
  ChevronLeftIcon,
  CloseIcon,
  EditIcon,
  PeopleIcon,
  SendIcon,
  TrashIcon,
} from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { subscribeToChannel } from "@/lib/supabase/realtime";
import {
  MESSAGE_COLUMNS,
  type ChatMessage,
  type CurrentUser,
  type Message,
  type Room,
} from "@/lib/types";

type PresenceMeta = { username: string };
type TypingPayload = { userId: string; username: string };
type ConnectionStatus = "connecting" | "live" | "offline";

const MAX_LENGTH = 2000;
const TYPING_TIMEOUT_MS = 3000;
const TYPING_THROTTLE_MS = 1500;
const GROUP_WINDOW_MS = 5 * 60 * 1000;

const time = (iso: string) => Date.parse(iso);

/** Insert or replace a message by id, keeping the list in chronological order. */
function upsertMessage(list: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const index = list.findIndex((m) => m.id === msg.id);
  if (index !== -1) {
    const next = list.slice();
    next[index] = { ...list[index], ...msg };
    return next;
  }
  const next = [...list, msg];
  const last = list.at(-1);
  if (last && time(last.created_at) > time(msg.created_at)) {
    next.sort((a, b) => time(a.created_at) - time(b.created_at));
  }
  return next;
}

export function ChatRoom({
  room,
  initialMessages,
  me,
}: {
  room: Room;
  initialMessages: ChatMessage[];
  me: CurrentUser;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [online, setOnline] = useState<CurrentUser[]>([]);
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();

  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSentRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  // ── Realtime: DB changes + presence + typing, all on one channel ──────────
  useEffect(() => {
    const supabase = createClient();
    const names = new Map<string, string>([[me.id, me.username]]);
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const stopTyping = (userId: string) => {
      clearTimeout(typingTimers.get(userId));
      typingTimers.delete(userId);
      setTyping((prev) => {
        if (!(userId in prev)) return prev;
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    };

    const resolveUsername = async (userId: string) => {
      const known = names.get(userId);
      if (known) return known;
      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle<{ username: string }>();
      const username = data?.username ?? "Unknown";
      names.set(userId, username);
      return username;
    };

    const roomFilter = `room_id=eq.${room.id}`;

    const unsubscribe = subscribeToChannel(
      supabase,
      `room:${room.id}`,
      { config: { presence: { key: me.id } } },
      (channel) => {
        channelRef.current = channel;
        channel
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "messages", filter: roomFilter },
            async ({ new: row }) => {
              const msg = row as Message;
              const username = await resolveUsername(msg.user_id);
              stopTyping(msg.user_id);
              setMessages((prev) => upsertMessage(prev, { ...msg, username }));
            },
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "messages", filter: roomFilter },
            ({ new: row }) => {
              const msg = row as Message;
              setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
            },
          )
          // Postgres DELETE events can't be filtered and only carry the primary
          // key, so listen table-wide and drop the id if we happen to have it.
          .on(
            "postgres_changes",
            { event: "DELETE", schema: "public", table: "messages" },
            ({ old }) => {
              const id = (old as Partial<Message>).id;
              if (id) setMessages((prev) => prev.filter((m) => m.id !== id));
            },
          )
          .on("presence", { event: "sync" }, () => {
            const state = channel.presenceState<PresenceMeta>();
            const users = Object.entries(state)
              .map(([id, metas]) => {
                const username = metas[0]?.username ?? "Unknown";
                names.set(id, username);
                return { id, username };
              })
              .sort((a, b) => a.username.localeCompare(b.username));
            setOnline(users);
          })
          .on("presence", { event: "leave" }, ({ key }) => stopTyping(key))
          .on("broadcast", { event: "typing" }, ({ payload }) => {
            const { userId, username } = payload as TypingPayload;
            if (!userId || userId === me.id) return;
            setTyping((prev) => (prev[userId] === username ? prev : { ...prev, [userId]: username }));
            clearTimeout(typingTimers.get(userId));
            typingTimers.set(
              userId,
              setTimeout(() => stopTyping(userId), TYPING_TIMEOUT_MS),
            );
          });
      },
      (subscribeStatus, channel) => {
        if (subscribeStatus === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          setStatus("live");
          // (Re-)announce ourselves; also runs after an automatic reconnect.
          void channel.track({ username: me.username } satisfies PresenceMeta);
        } else if (
          subscribeStatus === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
          subscribeStatus === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
        ) {
          setStatus("offline");
        }
      },
    );

    return () => {
      unsubscribe();
      channelRef.current = null;
      typingTimers.forEach(clearTimeout);
    };
  }, [room.id, me.id, me.username]);

  // ── Keep the view pinned to the newest message unless the user scrolled up ─
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function handleDraftChange(value: string) {
    setDraft(value);

    const channel = channelRef.current;
    const now = Date.now();
    if (!channel || status !== "live" || !value.trim()) return;
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: me.id, username: me.username } satisfies TypingPayload,
    });
  }

  async function sendMessage(e?: FormEvent) {
    e?.preventDefault();
    const content = draft.trim();
    if (!content) return;
    if (content.length > MAX_LENGTH) {
      setError(`Messages can be at most ${MAX_LENGTH} characters.`);
      return;
    }

    // Optimistic: show it immediately, swap in the real row when it's saved.
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    stickToBottomRef.current = true;
    lastTypingSentRef.current = 0;
    setDraft("");
    setError(null);
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        room_id: room.id,
        user_id: me.id,
        content,
        created_at: new Date().toISOString(),
        edited_at: null,
        username: me.username,
        pending: true,
      },
    ]);

    const { data, error } = await createClient()
      .from("messages")
      .insert({ room_id: room.id, content })
      .select(MESSAGE_COLUMNS)
      .single<Message>();

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft((current) => current || content);
      setError(`Couldn't send: ${error.message}`);
      return;
    }
    // The realtime INSERT may already have added it — upsert dedupes by id.
    setMessages((prev) =>
      upsertMessage(
        prev.filter((m) => m.id !== tempId),
        { ...data, username: me.username },
      ),
    );
  }

  async function saveEdit() {
    if (!editing) return;
    const original = messages.find((m) => m.id === editing.id);
    const content = editing.text.trim();
    setEditing(null);
    if (!original || !content || content === original.content) return;

    setMessages((prev) => prev.map((m) => (m.id === original.id ? { ...m, content } : m)));
    const { data, error } = await createClient()
      .from("messages")
      .update({ content })
      .eq("id", original.id)
      .select(MESSAGE_COLUMNS)
      .single<Message>();

    if (error) {
      setMessages((prev) =>
        prev.map((m) => (m.id === original.id ? { ...m, content: original.content } : m)),
      );
      setError(`Couldn't edit: ${error.message}`);
      return;
    }
    setMessages((prev) => upsertMessage(prev, { ...data, username: original.username }));
  }

  async function deleteMessage(message: ChatMessage) {
    if (!window.confirm("Delete this message for everyone?")) return;
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
    const { error } = await createClient().from("messages").delete().eq("id", message.id);
    if (error) {
      setMessages((prev) => upsertMessage(prev, message));
      setError(`Couldn't delete: ${error.message}`);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const typingNames = Object.values(typing);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 sm:px-5">
        <Link href="/chat" aria-label="Back to rooms" className="icon-btn -ml-1 md:hidden">
          <ChevronLeftIcon />
        </Link>
        <Avatar id={room.id} name={room.name} shape="square" />
        <h2 className="min-w-0 truncate font-semibold">{room.name}</h2>
        <nav aria-label="Room views" className="hidden self-stretch sm:flex">
          <span
            aria-current="page"
            className="relative flex items-center px-3 text-sm font-semibold after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-accent-text"
          >
            Chat
          </span>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {status !== "live" && (
            <span
              className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
                status === "connecting"
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "bg-danger/10 text-danger"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  status === "connecting" ? "animate-pulse bg-amber-500" : "bg-danger"
                }`}
              />
              {status === "connecting" ? "Connecting…" : "Reconnecting…"}
            </span>
          )}
          <div
            className="flex items-center gap-2"
            title={online.map((u) => u.username).join(", ")}
          >
            <div className="hidden -space-x-1.5 sm:flex">
              {online.slice(0, 4).map((u) => (
                <Avatar
                  key={u.id}
                  id={u.id}
                  name={u.username}
                  size="sm"
                  className="ring-2 ring-surface"
                />
              ))}
            </div>
            <span className="flex items-center gap-1 text-sm text-muted">
              <PeopleIcon className="h-4 w-4" />
              <span className="sr-only">Online now:</span>
              {online.length}
            </span>
          </div>
        </div>
      </header>

      <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <Avatar id={room.id} name={room.name} shape="square" size="xl" />
            <p className="font-semibold">This is the start of {room.name}</p>
            <p className="text-sm text-muted">Send a message to get the conversation going.</p>
          </div>
        ) : (
          <ol className="mx-auto flex max-w-5xl flex-col px-3 py-5 sm:px-6">
            {messages.map((message, i) => {
              const prev = messages[i - 1];
              // Day labels depend on the viewer's time zone, so they only
              // appear once we're running in the browser.
              const newDay =
                hydrated && (!prev || dayKey(prev.created_at) !== dayKey(message.created_at));
              const grouped =
                !!prev &&
                !newDay &&
                prev.user_id === message.user_id &&
                time(message.created_at) - time(prev.created_at) < GROUP_WINDOW_MS;
              return (
                <Fragment key={message.id}>
                  {newDay && <DayDivider iso={message.created_at} />}
                  <MessageRow
                    message={message}
                    grouped={grouped}
                    mine={message.user_id === me.id}
                    editText={editing?.id === message.id ? editing.text : null}
                    onEditStart={() => setEditing({ id: message.id, text: message.content })}
                    onEditChange={(text) => setEditing({ id: message.id, text })}
                    onEditSave={saveEdit}
                    onEditCancel={() => setEditing(null)}
                    onDelete={() => deleteMessage(message)}
                  />
                </Fragment>
              );
            })}
          </ol>
        )}
      </div>

      <form onSubmit={sendMessage} className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-5">
        <div className="mx-auto max-w-5xl">
          <p className="flex h-6 items-center gap-2 truncate px-1 text-xs text-muted" aria-live="polite">
            {typingNames.length > 0 && <TypingDots />}
            {typingLabel(typingNames)}
          </p>
          {error && (
            <p
              role="alert"
              className="mb-2 flex items-center justify-between gap-2 rounded-md bg-danger/10 px-3 py-1.5 text-xs text-danger"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
                className="rounded p-0.5 hover:bg-danger/10"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </p>
          )}
          <div className="flex items-end gap-1 rounded-md border border-border bg-surface py-1 pl-3 pr-1 shadow-sm transition focus-within:shadow-[inset_0_-2px_0_0_var(--accent-text)]">
            <textarea
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              rows={1}
              maxLength={MAX_LENGTH}
              placeholder="Type a message"
              aria-label="Message"
              className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send"
              title="Send (Enter) · Shift + Enter for a new line"
              className="mb-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-accent-text transition hover:bg-hover disabled:text-muted disabled:hover:bg-transparent"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

const noopSubscribe = () => () => {};

/** False during SSR and hydration, true afterwards — without an effect. */
function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function DayDivider({ iso }: { iso: string }) {
  return (
    <li className="mb-1 mt-6 flex items-center gap-3 text-xs font-semibold text-muted first:mt-0">
      <span className="h-px flex-1 bg-border" />
      {dayLabel(iso)}
      <span className="h-px flex-1 bg-border" />
    </li>
  );
}

function TypingDots() {
  return (
    <span aria-hidden className="flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 animate-bounce rounded-full bg-muted"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

function typingLabel(names: string[]) {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

function Timestamp({ iso, className = "" }: { iso: string; className?: string }) {
  const date = new Date(iso);
  // Server and browser can be in different time zones; the client value wins.
  return (
    <time
      dateTime={iso}
      title={date.toLocaleString()}
      suppressHydrationWarning
      className={`text-xs text-muted ${className}`}
    >
      {date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
    </time>
  );
}

function MessageRow({
  message,
  grouped,
  mine,
  editText,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
}: {
  message: ChatMessage;
  grouped: boolean;
  mine: boolean;
  editText: string | null;
  onEditStart: () => void;
  onEditChange: (text: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: () => void;
}) {
  const isEditing = editText !== null;
  const spacing = grouped ? "mt-0.5" : "mt-4 first:mt-0";

  const body = isEditing ? (
    <div className="mt-1 space-y-1.5">
      <textarea
        autoFocus
        value={editText}
        onChange={(e) => onEditChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onEditSave();
          } else if (e.key === "Escape") {
            onEditCancel();
          }
        }}
        maxLength={MAX_LENGTH}
        aria-label="Edit message"
        className="input field-sizing-content max-h-40 resize-none"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onEditCancel} className="btn-secondary px-2.5 py-1 text-xs">
          Cancel
        </button>
        <button type="button" onClick={onEditSave} className="btn-primary px-2.5 py-1 text-xs">
          Save
        </button>
      </div>
    </div>
  ) : (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {message.content}
      {message.edited_at && <span className="ml-1.5 text-xs text-muted">Edited</span>}
      {message.pending && <span className="ml-1.5 text-xs text-muted">Sending…</span>}
    </p>
  );

  if (mine) {
    return (
      // tabIndex lets a tap on touch screens focus the row and reveal its actions.
      <li
        tabIndex={-1}
        className={`group relative flex flex-col items-end pl-10 outline-none sm:pl-[20%] ${spacing} ${
          message.pending ? "opacity-70" : ""
        }`}
      >
        <div className={`max-w-full rounded-md bg-mine px-3.5 py-2 ${isEditing ? "w-full" : ""}`}>
          {!grouped && <Timestamp iso={message.created_at} className="block" />}
          {body}
        </div>

        {!message.pending && !isEditing && (
          <div className="pointer-events-none absolute -top-4 right-1 z-10 flex gap-0.5 rounded-md border border-border bg-surface p-0.5 opacity-0 shadow-md transition group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
            <button
              type="button"
              onClick={onEditStart}
              aria-label="Edit message"
              title="Edit"
              className="icon-btn h-7 w-7"
            >
              <EditIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete message"
              title="Delete"
              className="icon-btn h-7 w-7 hover:bg-danger/10 hover:text-danger"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </li>
    );
  }

  return (
    <li className={`flex gap-2 pr-10 sm:pr-[20%] ${spacing}`}>
      <div className="w-8 shrink-0">
        {!grouped && <Avatar id={message.user_id} name={message.username} />}
      </div>
      <div className="min-w-0 rounded-md bg-surface px-3.5 py-2 shadow-sm">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="truncate text-xs font-semibold">{message.username}</span>
            <Timestamp iso={message.created_at} />
          </div>
        )}
        {body}
      </div>
    </li>
  );
}
