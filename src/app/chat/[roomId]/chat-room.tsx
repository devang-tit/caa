"use client";

import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
} from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Avatar } from "@/components/avatar";
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
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <Link
          href="/chat"
          aria-label="Back to rooms"
          className="-ml-1 rounded-md px-2 py-1 text-muted hover:bg-hover md:hidden"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">
            <span className="text-muted">#</span> {room.name}
          </h2>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span
              className={`h-2 w-2 rounded-full ${
                status === "live"
                  ? "bg-success"
                  : status === "connecting"
                    ? "animate-pulse bg-amber-500"
                    : "bg-danger"
              }`}
            />
            {status === "live"
              ? `${online.length} online`
              : status === "connecting"
                ? "Connecting…"
                : "Reconnecting…"}
          </p>
        </div>
        <div
          className="flex -space-x-2"
          title={online.map((u) => u.username).join(", ")}
        >
          {online.slice(0, 5).map((u) => (
            <Avatar key={u.id} id={u.id} name={u.username} size="sm" className="ring-2 ring-surface" />
          ))}
          {online.length > 5 && (
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-hover text-[10px] font-medium ring-2 ring-surface">
              +{online.length - 5}
            </span>
          )}
        </div>
      </header>

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-4 sm:px-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="font-medium">This is the start of #{room.name}</p>
            <p className="text-sm text-muted">Say hello 👋</p>
          </div>
        ) : (
          <ol className="flex flex-col">
            {messages.map((message, i) => {
              const prev = messages[i - 1];
              const grouped =
                !!prev &&
                prev.user_id === message.user_id &&
                time(message.created_at) - time(prev.created_at) < GROUP_WINDOW_MS;
              return (
                <MessageRow
                  key={message.id}
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
              );
            })}
          </ol>
        )}
      </div>

      <p className="h-5 truncate px-4 text-xs text-muted" aria-live="polite">
        {typingLabel(typingNames)}
      </p>

      <form onSubmit={sendMessage} className="border-t border-border bg-surface p-3">
        {error && (
          <p role="alert" className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
              ✕
            </button>
          </p>
        )}
        <div className="flex items-end gap-2">
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
            placeholder={`Message #${room.name}`}
            aria-label="Message"
            className="input field-sizing-content max-h-40 min-h-10 resize-none"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="h-10 shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
        <p className="mt-1.5 hidden text-[11px] text-muted sm:block">
          Enter to send · Shift + Enter for a new line
        </p>
      </form>
    </div>
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
      className={`text-[11px] text-muted ${className}`}
    >
      {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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

  return (
    <li
      className={`group relative flex gap-3 rounded-lg px-2 py-0.5 hover:bg-hover ${
        grouped ? "" : "mt-3 first:mt-0"
      } ${message.pending ? "opacity-60" : ""}`}
    >
      <div className="w-9 shrink-0">
        {grouped ? (
          <Timestamp
            iso={message.created_at}
            className="invisible block pt-1 text-center text-[10px] group-hover:visible"
          />
        ) : (
          <Avatar id={message.user_id} name={message.username} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold">
              {message.username}
              {mine && <span className="ml-1 font-normal text-muted">(you)</span>}
            </span>
            <Timestamp iso={message.created_at} />
          </div>
        )}

        {isEditing ? (
          <div className="mt-1 space-y-1">
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
            <p className="text-[11px] text-muted">
              Enter to save · Esc to{" "}
              <button type="button" onClick={onEditCancel} className="text-accent hover:underline">
                cancel
              </button>
            </p>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {message.content}
            {message.edited_at && <span className="ml-1 text-[11px] text-muted">(edited)</span>}
            {message.pending && <span className="ml-1 text-[11px] text-muted">sending…</span>}
          </p>
        )}
      </div>

      {mine && !message.pending && !isEditing && (
        <div className="absolute -top-3 right-2 flex gap-0.5 rounded-md border border-border bg-surface p-0.5 opacity-0 shadow-sm transition group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:static [@media(hover:none)]:self-start [@media(hover:none)]:opacity-100 [@media(hover:none)]:shadow-none">
          <button
            type="button"
            onClick={onEditStart}
            className="rounded px-2 py-0.5 text-xs text-muted hover:bg-hover hover:text-foreground"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded px-2 py-0.5 text-xs text-muted hover:bg-danger/10 hover:text-danger"
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}
