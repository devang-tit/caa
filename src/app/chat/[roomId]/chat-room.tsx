"use client";

import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Avatar } from "@/components/avatar";
import { PeopleIcon } from "@/components/icons";
import { usePeople } from "@/components/session-provider";
import { isChatVisible, onChatVisibilityChange } from "@/lib/embed";
import { createClient } from "@/lib/supabase/client";
import { subscribeToChannel } from "@/lib/supabase/realtime";
import {
  conversationTitle,
  MESSAGE_COLUMNS,
  MESSAGE_WITH_REACTIONS,
  splitReactions,
  type ChatMessage,
  type CurrentUser,
  type Member,
  type Message,
  type MessagePreview,
  type MessageWithReactions,
  type Reaction,
  type Room,
  type RoomMember,
} from "@/lib/types";
import { Composer, type OutgoingMessage } from "./composer";
import { MessageItem, type Receipt } from "./message-item";
import { MessageMenu, type MenuState } from "./message-menu";
import { RoomHeader, type ConnectionStatus } from "./room-header";

type PresenceMeta = { username: string };
type TypingPayload = { userId: string; username: string };

const PAGE_SIZE = 50;
const TYPING_TIMEOUT_MS = 3000;
const TYPING_THROTTLE_MS = 1500;
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const MARK_READ_INTERVAL_MS = 3000;
const HIGHLIGHT_MS = 2500;

const time = (iso: string) => Date.parse(iso);
const reactionKey = (r: Reaction) => `${r.message_id}|${r.user_id}|${r.emoji}`;

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

/** Keep the pinned list in sync with a message's pinned_at. */
function syncPinned(list: Message[], msg: Message): Message[] {
  const without = list.filter((m) => m.id !== msg.id);
  if (!msg.pinned_at) return without.length === list.length ? list : without;
  return [msg, ...without].sort((a, b) => time(b.pinned_at!) - time(a.pinned_at!));
}

export function ChatRoom({
  room,
  me,
  initialMessages,
  initialReactions,
  initialParents,
  initialMembers,
  initialPinned,
  initialSavedIds,
  initialHasOlder,
  focusId,
}: {
  room: Room;
  me: CurrentUser;
  initialMessages: Message[];
  initialReactions: Reaction[];
  initialParents: MessagePreview[];
  initialMembers: RoomMember[];
  initialPinned: Message[];
  initialSavedIds: string[];
  initialHasOlder: boolean;
  focusId: string | null;
}) {
  const router = useRouter();
  const people = usePeople();
  const hydrated = useHydrated();

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [reactions, setReactions] = useState(initialReactions);
  const [parents, setParents] = useState<Record<string, MessagePreview>>(() =>
    Object.fromEntries(initialParents.map((p) => [p.id, p])),
  );
  const [members, setMembers] = useState(initialMembers);
  const [pinned, setPinned] = useState(initialPinned);
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(() => new Set(initialSavedIds));
  const [hasOlder, setHasOlder] = useState(initialHasOlder);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [here, setHere] = useState<Member[]>([]);
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [replyTo, setReplyTo] = useState<MessagePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(focusId);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSentRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLOListElement>(null);
  const stickToBottomRef = useRef(!focusId);
  const prependHeightRef = useRef<number | null>(null);
  const requestMarkReadRef = useRef<() => void>(() => {});
  const messagesRef = useRef(messages);
  const editingRef = useRef(editing);

  useEffect(() => {
    messagesRef.current = messages;
    editingRef.current = editing;
  });

  const nameOf = useCallback(
    (userId: string) => people.get(userId)?.username ?? "Unknown",
    [people],
  );

  const memberList: Member[] = useMemo(
    () => members.map((m) => ({ id: m.user_id, username: nameOf(m.user_id) })),
    [members, nameOf],
  );
  const title = conversationTitle(room, memberList, me.id);

  /** Fetch quotes for replies whose original isn't loaded. */
  const loadParents = useCallback(async (ids: string[]) => {
    const missing = ids.filter((id) => !messagesRef.current.some((m) => m.id === id));
    if (missing.length === 0) return;
    const { data } = await createClient()
      .from("messages")
      .select("id, user_id, content, attachments")
      .in("id", missing)
      .overrideTypes<MessagePreview[], { merge: false }>();
    if (data?.length) {
      setParents((prev) => ({ ...prev, ...Object.fromEntries(data.map((p) => [p.id, p])) }));
    }
  }, []);

  // ── Read state: tell the server we've seen this conversation ───────────────
  useEffect(() => {
    const supabase = createClient();
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = false;

    const run = () => {
      pending = false;
      last = Date.now();
      // Query builders are lazy: .then() is what actually sends the request.
      void supabase.rpc("mark_room_read", { target: room.id }).then(() => {});
    };
    const request = () => {
      if (!isChatVisible()) return;
      pending = true;
      clearTimeout(timer);
      timer = setTimeout(run, Math.max(0, last + MARK_READ_INTERVAL_MS - Date.now()));
    };

    requestMarkReadRef.current = request;
    request();
    const stopWatching = onChatVisibilityChange(request);
    return () => {
      clearTimeout(timer);
      if (pending) run();
      stopWatching();
      requestMarkReadRef.current = () => {};
    };
  }, [room.id]);

  // ── Realtime: messages, reactions, read state, presence, typing ────────────
  useEffect(() => {
    const supabase = createClient();
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const roomFilter = `room_id=eq.${room.id}`;

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
            ({ new: row }) => {
              const msg = row as Message;
              stopTyping(msg.user_id);
              setMessages((prev) => upsertMessage(prev, msg));
              if (msg.user_id !== me.id) requestMarkReadRef.current();
              if (msg.reply_to) void loadParents([msg.reply_to]);
            },
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "messages", filter: roomFilter },
            ({ new: row }) => {
              const msg = row as Message;
              setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
              setPinned((prev) => syncPinned(prev, msg));
              setParents((prev) =>
                prev[msg.id] ? { ...prev, [msg.id]: { ...prev[msg.id], content: msg.content } } : prev,
              );
            },
          )
          // DELETE events can't be filtered and only carry the primary key,
          // so listen table-wide and drop whatever we happen to have.
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, ({ old }) => {
            const id = (old as Partial<Message>).id;
            if (!id) return;
            setMessages((prev) => prev.filter((m) => m.id !== id));
            setPinned((prev) => prev.filter((m) => m.id !== id));
          })
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "message_reactions", filter: roomFilter },
            ({ new: row }) => {
              const r = row as Reaction;
              const reaction = { message_id: r.message_id, user_id: r.user_id, emoji: r.emoji };
              setReactions((prev) =>
                prev.some((x) => reactionKey(x) === reactionKey(reaction)) ? prev : [...prev, reaction],
              );
            },
          )
          .on(
            "postgres_changes",
            { event: "DELETE", schema: "public", table: "message_reactions" },
            ({ old }) => {
              const r = old as Partial<Reaction>;
              if (!r.message_id || !r.user_id || !r.emoji) return;
              const key = reactionKey(r as Reaction);
              setReactions((prev) => {
                const next = prev.filter((x) => reactionKey(x) !== key);
                return next.length === prev.length ? prev : next;
              });
            },
          );

        if (room.kind !== "channel") {
          channel.on(
            "postgres_changes",
            { event: "*", schema: "public", table: "room_members", filter: roomFilter },
            ({ new: row }) => {
              const member = row as RoomMember;
              if (!member?.user_id) return;
              setMembers((prev) =>
                prev.some((m) => m.user_id === member.user_id)
                  ? prev.map((m) => (m.user_id === member.user_id ? { ...m, ...member } : m))
                  : [...prev, member],
              );
            },
          );
        }

        channel
          .on("presence", { event: "sync" }, () => {
            const state = channel.presenceState<PresenceMeta>();
            setHere(
              Object.entries(state)
                .map(([id, metas]) => ({ id, username: metas[0]?.username ?? "Unknown" }))
                .sort((a, b) => a.username.localeCompare(b.username)),
            );
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
  }, [room.id, room.kind, me.id, me.username, loadParents]);

  // ── Scrolling ──────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prependHeightRef.current !== null) {
      // Older messages were added above: keep the same messages in view.
      el.scrollTop += el.scrollHeight - prependHeightRef.current;
      prependHeightRef.current = null;
    } else if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, reactions]);

  // Images and day dividers change the height after render; stay pinned.
  const hasMessages = messages.length > 0;
  useEffect(() => {
    const list = listRef.current;
    const content = contentRef.current;
    if (!list || !content) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) list.scrollTop = list.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [hasMessages]);

  useEffect(() => {
    if (focusId) document.getElementById(`msg-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightId]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (menu) setMenu(null);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function handleTyping(value: string) {
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

  async function sendMessage({ content, mentions, attachments, replyTo: parent }: OutgoingMessage) {
    // Optimistic: show it immediately, swap in the real row when it's saved.
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    stickToBottomRef.current = true;
    lastTypingSentRef.current = 0;
    setError(null);
    setReplyTo(null);
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        room_id: room.id,
        user_id: me.id,
        content,
        created_at: new Date().toISOString(),
        edited_at: null,
        reply_to: parent?.id ?? null,
        mentions,
        attachments,
        pinned_at: null,
        pinned_by: null,
        pending: true,
      },
    ]);

    const { data, error } = await createClient()
      .from("messages")
      .insert({ room_id: room.id, content, mentions, attachments, reply_to: parent?.id ?? null })
      .select(MESSAGE_COLUMNS)
      .single<Message>();

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setReplyTo(parent);
      setError(`Couldn't send: ${error.message}`);
      return false;
    }
    // The realtime INSERT may already have added it — upsert dedupes by id.
    setMessages((prev) => upsertMessage(prev.filter((m) => m.id !== tempId), data));
    return true;
  }

  const saveEdit = useCallback(async () => {
    const current = editingRef.current;
    if (!current) return;
    const original = messagesRef.current.find((m) => m.id === current.id);
    const content = current.text.trim();
    setEditing(null);
    if (!original || content === original.content) return;
    if (!content && original.attachments.length === 0) return;

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
    setMessages((prev) => upsertMessage(prev, data));
  }, []);

  async function deleteMessage(message: ChatMessage) {
    if (!window.confirm("Delete this message for everyone?")) return;
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
    setPinned((prev) => prev.filter((m) => m.id !== message.id));
    const supabase = createClient();
    const { error } = await supabase.from("messages").delete().eq("id", message.id);
    if (error) {
      setMessages((prev) => upsertMessage(prev, message));
      setPinned((prev) => syncPinned(prev, message));
      setError(`Couldn't delete: ${error.message}`);
      return;
    }
    if (message.attachments.length) {
      void supabase.storage.from("attachments").remove(message.attachments.map((a) => a.path));
    }
  }

  const reactionsRef = useRef(reactions);
  useEffect(() => {
    reactionsRef.current = reactions;
  }, [reactions]);

  const toggleReaction = useCallback(
    async (message: ChatMessage, emoji: string) => {
      const reaction: Reaction = { message_id: message.id, user_id: me.id, emoji };
      const key = reactionKey(reaction);
      const had = reactionsRef.current.some((r) => reactionKey(r) === key);
      const add = (prev: Reaction[]) =>
        prev.some((r) => reactionKey(r) === key) ? prev : [...prev, reaction];
      const remove = (prev: Reaction[]) => prev.filter((r) => reactionKey(r) !== key);

      setReactions(had ? remove : add);
      const supabase = createClient();
      const { error } = had
        ? await supabase.from("message_reactions").delete().match(reaction)
        : await supabase.from("message_reactions").insert({ message_id: message.id, emoji });

      if (error && error.code !== "23505") {
        setReactions(had ? add : remove);
        setError(`Couldn't update the reaction: ${error.message}`);
      }
    },
    [me.id],
  );

  async function togglePin(message: Message) {
    const { data, error } = await createClient().rpc("toggle_pin", { target: message.id });
    if (error) {
      setError(`Couldn't update the pin: ${error.message}`);
      return;
    }
    const pinnedAt = (data as string | null) ?? null;
    const updated = { ...message, pinned_at: pinnedAt, pinned_by: pinnedAt ? me.id : null };
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, ...updated } : m)));
    setPinned((prev) => syncPinned(prev, updated));
  }

  async function toggleSave(message: Message) {
    const saved = savedIds.has(message.id);
    const update = (add: boolean) =>
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (add) next.add(message.id);
        else next.delete(message.id);
        return next;
      });
    update(!saved);
    const supabase = createClient();
    const { error } = saved
      ? await supabase.from("saved_messages").delete().eq("message_id", message.id)
      : await supabase.from("saved_messages").insert({ message_id: message.id });
    if (error && error.code !== "23505") {
      update(saved);
      setError(`Couldn't update saved messages: ${error.message}`);
    }
  }

  async function loadOlder() {
    const oldest = messages.find((m) => !m.pending);
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    const { data, error } = await createClient()
      .from("messages")
      .select(MESSAGE_WITH_REACTIONS)
      .eq("room_id", room.id)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE)
      .overrideTypes<MessageWithReactions[], { merge: false }>();
    setLoadingOlder(false);
    if (error) {
      setError(`Couldn't load earlier messages: ${error.message}`);
      return;
    }

    const { messages: older, reactions: olderReactions } = splitReactions(data.slice().reverse());
    prependHeightRef.current = listRef.current?.scrollHeight ?? null;
    setMessages((prev) => [...older.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
    setReactions((prev) => {
      const keys = new Set(prev.map(reactionKey));
      return [...prev, ...olderReactions.filter((r) => !keys.has(reactionKey(r)))];
    });
    setHasOlder(data.length === PAGE_SIZE);
    const replyIds = older.map((m) => m.reply_to).filter((id): id is string => !!id);
    if (replyIds.length) void loadParents(replyIds);
  }

  const jumpTo = useCallback(
    (id: string) => {
      if (messagesRef.current.some((m) => m.id === id)) {
        document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
        setHighlightId(id);
      } else {
        router.push(`/chat/${room.id}?m=${id}`);
      }
    },
    [room.id, router],
  );

  const startReply = useCallback((message: ChatMessage) => {
    setReplyTo({
      id: message.id,
      user_id: message.user_id,
      content: message.content,
      attachments: message.attachments,
    });
  }, []);

  const openMenu = useCallback((message: ChatMessage, anchor: DOMRect) => {
    setMenu({ message, anchor });
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const changeEdit = useCallback(
    (text: string) => setEditing((prev) => (prev ? { ...prev, text } : prev)),
    [],
  );
  const cancelEdit = useCallback(() => setEditing(null), []);

  // ── Derived view data ──────────────────────────────────────────────────────
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, Reaction[]>();
    for (const r of reactions) {
      const list = map.get(r.message_id);
      if (list) list.push(r);
      else map.set(r.message_id, [r]);
    }
    return map;
  }, [reactions]);

  const receipt = useMemo((): { id: string; value: Receipt } | null => {
    if (room.kind === "channel") return null;
    const last = messages.findLast((m) => m.user_id === me.id && !m.pending);
    if (!last) return null;
    const others = members.filter((m) => m.user_id !== me.id);
    const seen = others.filter((m) => time(m.last_read_at) >= time(last.created_at));
    const names = seen.map((m) => nameOf(m.user_id)).join(", ");
    let label = "Sent";
    if (seen.length && room.kind === "direct") label = "Seen";
    else if (seen.length && seen.length === others.length) label = "Seen by everyone";
    else if (seen.length) label = `Seen by ${seen.length}`;
    return { id: last.id, value: { seen: seen.length > 0, label, title: names || undefined } };
  }, [messages, members, me.id, room.kind, nameOf]);

  const mentionCandidates: Member[] = useMemo(() => {
    const pool =
      room.kind === "channel"
        ? [...people.values()].map((p) => ({ id: p.id, username: p.username }))
        : memberList;
    return pool.filter((p) => p.id !== me.id);
  }, [room.kind, people, memberList, me.id]);

  const typingNames = Object.values(typing);
  const menuMessage = menu ? (byId.get(menu.message.id) ?? null) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RoomHeader
        room={room}
        title={title}
        meId={me.id}
        members={memberList}
        here={here}
        status={status}
        pinned={pinned}
        nameOf={nameOf}
        onJump={jumpTo}
        onUnpin={togglePin}
      />

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto [--avatar-ring:var(--background)]"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            {room.kind === "channel" ? (
              <Avatar id={room.id} name={title} shape="square" size="xl" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-mine text-accent-text">
                <PeopleIcon className="h-8 w-8" />
              </span>
            )}
            <p className="font-semibold">
              {room.kind === "channel"
                ? `This is the start of ${title}`
                : `This is the beginning of your chat with ${title}`}
            </p>
            <p className="text-sm text-muted">Send a message to get the conversation going.</p>
          </div>
        ) : (
          <ol ref={contentRef} className="mx-auto flex max-w-5xl flex-col px-3 py-6 sm:px-6">
            {hasOlder && (
              <li className="mb-4 flex justify-center">
                <button
                  type="button"
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="btn-secondary px-3 py-1 text-xs"
                >
                  {loadingOlder ? "Loading…" : "Load earlier messages"}
                </button>
              </li>
            )}
            {messages.map((message, i) => {
              const prev = messages[i - 1];
              // Day labels depend on the viewer's time zone, so they only
              // appear once we're running in the browser.
              const newDay =
                hydrated && (!prev || dayKey(prev.created_at) !== dayKey(message.created_at));
              const grouped =
                !!prev &&
                !newDay &&
                !message.reply_to &&
                prev.user_id === message.user_id &&
                time(message.created_at) - time(prev.created_at) < GROUP_WINDOW_MS;
              const parentId = message.reply_to;
              const parent = parentId ? (byId.get(parentId) ?? parents[parentId] ?? null) : null;
              return (
                <Fragment key={message.id}>
                  {newDay && <DayDivider iso={message.created_at} />}
                  <MessageItem
                    message={message}
                    mine={message.user_id === me.id}
                    grouped={grouped}
                    authorName={nameOf(message.user_id)}
                    parent={parent}
                    parentAuthor={parent ? nameOf(parent.user_id) : ""}
                    reactions={reactionsByMessage.get(message.id) ?? EMPTY}
                    nameOf={nameOf}
                    meId={me.id}
                    selfName={me.username}
                    mentionNames={message.mentions.map(nameOf)}
                    highlighted={highlightId === message.id}
                    receipt={receipt?.id === message.id ? receipt.value : null}
                    editText={editing?.id === message.id ? editing.text : null}
                    onReact={toggleReaction}
                    onReply={startReply}
                    onMenu={openMenu}
                    onJump={jumpTo}
                    onEditChange={changeEdit}
                    onEditSave={saveEdit}
                    onEditCancel={cancelEdit}
                  />
                </Fragment>
              );
            })}
          </ol>
        )}
      </div>

      <Composer
        roomId={room.id}
        candidates={mentionCandidates}
        replyTo={replyTo}
        replyAuthor={replyTo ? nameOf(replyTo.user_id) : ""}
        typingLabel={typingLabel(typingNames)}
        error={error}
        onDismissError={() => setError(null)}
        onCancelReply={() => setReplyTo(null)}
        onSend={sendMessage}
        onTyping={handleTyping}
      />

      {menu && menuMessage && (
        <MessageMenu
          state={{ anchor: menu.anchor, message: menuMessage }}
          mine={menuMessage.user_id === me.id}
          saved={savedIds.has(menuMessage.id)}
          onClose={closeMenu}
          onReply={() => startReply(menuMessage)}
          onTogglePin={() => togglePin(menuMessage)}
          onToggleSave={() => toggleSave(menuMessage)}
          onCopy={() => void navigator.clipboard?.writeText(menuMessage.content)}
          onEdit={() => setEditing({ id: menuMessage.id, text: menuMessage.content })}
          onDelete={() => deleteMessage(menuMessage)}
        />
      )}
    </div>
  );
}

const EMPTY: Reaction[] = [];

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

function typingLabel(names: string[]) {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}
