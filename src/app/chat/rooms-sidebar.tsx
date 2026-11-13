"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import { Suspense, useEffect, useRef, useState } from "react";
import { Avatar, GroupAvatar } from "@/components/avatar";
import { ChatIcon, ComposeIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { usePeople, usePresence } from "@/components/session-provider";
import { postToParent } from "@/lib/embed";
import { plainText } from "@/lib/rich-text";
import { createClient } from "@/lib/supabase/client";
import { subscribeToChannel } from "@/lib/supabase/realtime";
import {
  conversationTitle,
  STATUS_LABELS,
  toLastMessage,
  type Conversation,
  type CurrentUser,
  type Member,
  type Message,
} from "@/lib/types";
import { InstallBanner } from "./install-app";
import { LargeTitleScreen } from "./large-title";
import { NewChatSheet, type NewChatHandle } from "./new-chat-dialog";
import { MessageHits, RoomSearchBox, useRoomSearch } from "./room-search";

type Filter = "all" | "unread" | "chats" | "channels";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "chats", label: "Chats" },
  { id: "channels", label: "Channels" },
];

const activity = (c: Conversation) => c.last_message_at ?? c.created_at;

export function RoomsSidebar({
  me,
  initialConversations,
}: {
  me: CurrentUser;
  initialConversations: Conversation[];
}) {
  const pathname = usePathname();
  const { roomId } = useParams<{ roomId?: string }>();
  const { query } = useRoomSearch();
  const people = usePeople();
  const [conversations, setConversations] = useState(initialConversations);
  const [filter, setFilter] = useState<Filter>("all");
  const newChatRef = useRef<NewChatHandle>(null);

  // Opening a conversation reads it, and so does leaving it: clear both
  // badges when the route changes (state adjusted during render).
  const [openRoom, setOpenRoom] = useState(roomId);
  if (openRoom !== roomId) {
    setOpenRoom(roomId);
    setConversations((prev) =>
      prev.map((c) =>
        (c.id === roomId || c.id === openRoom) && c.unread_count ? { ...c, unread_count: 0 } : c,
      ),
    );
  }

  const roomIdRef = useRef(roomId);
  const conversationsRef = useRef(conversations);
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Live list: new messages bump chats to the top, update the preview and
  // add unread badges; new channels or chats you're added to show up
  // instantly; a deleted or edited newest message updates its preview.
  useEffect(() => {
    const supabase = createClient();
    let refetchTimer: ReturnType<typeof setTimeout> | undefined;
    const known = (id: string) => conversationsRef.current.some((c) => c.id === id);

    const refetch = () => {
      clearTimeout(refetchTimer);
      refetchTimer = setTimeout(async () => {
        const { data } = await supabase.rpc("list_conversations");
        if (!data) return;
        setConversations(
          (data as Conversation[]).map((c) =>
            c.id === roomIdRef.current ? { ...c, unread_count: 0 } : c,
          ),
        );
      }, 300);
    };

    const unsubscribe = subscribeToChannel(
      supabase,
      `sidebar:${me.id}`,
      { config: {} },
      (channel) => {
        channel
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "rooms" }, refetch)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "room_members", filter: `user_id=eq.${me.id}` },
            ({ new: row }) => {
              if (!known((row as { room_id: string }).room_id)) refetch();
            },
          )
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, ({ new: row }) => {
            const msg = row as Message;
            // Badge on the embedding widget (no-op when not embedded).
            if (msg.user_id !== me.id) postToParent({ type: "caa:new-message" });
            if (!known(msg.room_id)) {
              refetch();
              return;
            }
            const counts = msg.user_id !== me.id && msg.room_id !== roomIdRef.current;
            setConversations((prev) =>
              prev.map((c) =>
                c.id === msg.room_id
                  ? {
                      ...c,
                      last_message_at: msg.created_at,
                      last_message: toLastMessage(msg),
                      unread_count: counts ? c.unread_count + 1 : c.unread_count,
                    }
                  : c,
              ),
            );
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, ({ new: row }) => {
            const msg = row as Message;
            setConversations((prev) =>
              prev.some((c) => c.last_message?.id === msg.id)
                ? prev.map((c) =>
                    c.last_message?.id === msg.id ? { ...c, last_message: toLastMessage(msg) } : c,
                  )
                : prev,
            );
          })
          // DELETE events only carry the id (and aren't filtered): if it was
          // a preview, reload to get the new newest message.
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, ({ old }) => {
            const id = (old as Partial<Message>).id;
            if (id && conversationsRef.current.some((c) => c.last_message?.id === id)) refetch();
          });
      },
      (status) => {
        // Changes made while disconnected (phone asleep, app in the background)
        // never arrive, so reload the list on every (re)connect.
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) refetch();
      },
    );

    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 15_000) refetch();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimeout(refetchTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
    };
  }, [me.id]);

  const needle = query.trim().toLowerCase();
  const unreadTotal = conversations.filter((c) => c.unread_count > 0 && c.id !== roomId).length;
  const rows = conversations
    .map((c) => ({ ...c, title: conversationTitle(c, c.members, me.id) }))
    .filter((c) => {
      if (needle && !c.title.toLowerCase().includes(needle)) return false;
      if (filter === "unread") return c.unread_count > 0 && c.id !== roomId;
      if (filter === "chats") return c.kind !== "channel";
      if (filter === "channels") return c.kind === "channel";
      return true;
    })
    .sort((a, b) => activity(b).localeCompare(activity(a)));

  const nameOf = (id: string) => people.get(id)?.username ?? "Someone";

  return (
    <aside
      className={`${pathname === "/chat" ? "flex" : "hidden md:flex"} relative w-full flex-col bg-pane md:w-80 md:shrink-0 md:border-r md:border-border lg:w-[22rem]`}
    >
      <LargeTitleScreen
        title="Chats"
        actions={
          <button
            type="button"
            onClick={() => newChatRef.current?.open()}
            aria-label="New chat"
            title="New chat"
            className="icon-btn hidden text-foreground md:inline-flex"
          >
            <ComposeIcon />
          </button>
        }
      >
        <div className="px-4 pb-3 md:hidden">
          <RoomSearchBox variant="field" />
        </div>

        <div
          role="group"
          aria-label="Show"
          className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] md:px-5"
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={active}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition active:scale-95 ${
                  active ? "bg-foreground text-pane" : "bg-hover text-foreground hover:bg-border/70"
                }`}
              >
                {f.label}
                {f.id === "unread" && unreadTotal > 0 && (
                  <span
                    className={`min-w-5 rounded-full px-1 text-center text-[11px] leading-5 font-bold ${
                      active ? "bg-pane/20" : "bg-accent text-accent-foreground"
                    }`}
                  >
                    {unreadTotal}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <InstallBanner />

        <nav aria-label="Conversations" className="pb-32 md:px-2 md:pb-4">
          {rows.length === 0 ? (
            <EmptyRows
              searching={!!needle}
              query={query.trim()}
              filter={filter}
              onNewChat={() => newChatRef.current?.open()}
            />
          ) : (
            <ul>
              {rows.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  title={c.title}
                  active={c.id === roomId}
                  meId={me.id}
                  nameOf={nameOf}
                />
              ))}
            </ul>
          )}

          {/* Phones have no search dropdown: matching messages list here. */}
          {needle.length >= 2 && (
            <div className="mt-2 md:hidden">
              <Suspense fallback={<p className="px-4 py-2 text-sm text-muted">Searching…</p>}>
                <MessageHits query={query.trim()} inline />
              </Suspense>
            </div>
          )}
        </nav>
      </LargeTitleScreen>

      <button
        type="button"
        onClick={() => newChatRef.current?.open()}
        aria-label="New chat"
        className="fab absolute right-4 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-30 md:hidden"
      >
        <ComposeIcon className="h-6 w-6" />
      </button>

      <NewChatSheet
        ref={newChatRef}
        meId={me.id}
        onChannelCreated={(room) =>
          setConversations((prev) =>
            prev.some((c) => c.id === room.id)
              ? prev
              : [...prev, { ...room, last_message_at: null, unread_count: 0, members: [], last_message: null }],
          )
        }
      />
    </aside>
  );
}

function EmptyRows({
  searching,
  query,
  filter,
  onNewChat,
}: {
  searching: boolean;
  query: string;
  filter: Filter;
  onNewChat: () => void;
}) {
  if (searching) {
    return <p className="px-5 py-6 text-center text-sm text-muted">No chats or channels match “{query}”.</p>;
  }
  if (filter === "unread") {
    return (
      <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
        <p className="text-[15px] font-semibold">You’re all caught up</p>
        <p className="text-sm text-muted">New messages will show up here.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
        <ChatIcon className="h-7 w-7" />
      </span>
      <div>
        <p className="text-[15px] font-semibold">
          {filter === "channels" ? "No channels yet" : "No chats yet"}
        </p>
        <p className="mt-0.5 text-sm text-muted">
          {filter === "channels"
            ? "Create one for a team or a topic."
            : "Message someone or start a group."}
        </p>
      </div>
      <button type="button" onClick={onNewChat} className="btn-primary">
        {filter === "channels" ? "New channel" : "Start a chat"}
      </button>
    </div>
  );
}

function ConversationRow({
  conversation: c,
  title,
  active,
  meId,
  nameOf,
}: {
  conversation: Conversation;
  title: string;
  active: boolean;
  meId: string;
  nameOf: (id: string) => string;
}) {
  const unread = active ? 0 : c.unread_count;
  const other = c.kind === "direct" ? c.members.find((m) => m.id !== meId) : undefined;

  return (
    <li className="group/row">
      <Link
        href={`/chat/${c.id}`}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 pl-4 transition md:rounded-xl md:px-3 ${
          active
            ? "bg-accent-soft [--avatar-ring:var(--accent-soft)]"
            : "[--avatar-ring:var(--pane)] hover:bg-pane-hover active:bg-pane-hover"
        }`}
      >
        {c.kind === "channel" ? (
          <Avatar id={c.id} name={title} shape="square" size="row" />
        ) : other ? (
          <PersonAvatar userId={other.id} name={other.username} size="row" />
        ) : (
          <GroupAvatar size="row" />
        )}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 border-border/70 py-3 pr-4 max-md:border-b max-md:group-last/row:border-0 md:py-2.5 md:pr-0">
          <div className="flex items-baseline gap-2">
            <span className={`min-w-0 flex-1 truncate text-[16px] md:text-[15px] ${unread ? "font-bold" : "font-semibold"}`}>
              {c.kind === "channel" && <span className="mr-0.5 text-muted">#</span>}
              {title}
            </span>
            {c.last_message_at && (
              <time
                dateTime={c.last_message_at}
                suppressHydrationWarning
                className={`shrink-0 text-xs ${unread ? "font-semibold text-accent-text" : "text-muted"}`}
              >
                {shortTime(c.last_message_at)}
              </time>
            )}
          </div>
          <div className="flex items-center gap-2">
            <p className={`min-w-0 flex-1 truncate text-sm ${unread ? "text-foreground" : "text-muted"}`}>
              <Preview conversation={c} meId={meId} nameOf={nameOf} other={other} />
            </p>
            {unread > 0 && (
              <span className="min-w-5 shrink-0 rounded-full bg-accent px-1.5 text-center text-[11px] leading-5 font-bold text-accent-foreground">
                {unread > 99 ? "99+" : unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

/** "You: See you at 3", "Sam: 📷 Photo"; before any message, who it's with. */
function Preview({
  conversation: c,
  meId,
  nameOf,
  other,
}: {
  conversation: Conversation;
  meId: string;
  nameOf: (id: string) => string;
  other: Member | undefined;
}) {
  const last = c.last_message;
  if (last) {
    const body = plainText(last.content) || attachmentLabel(last.attachments, last.attachment);
    const who =
      last.user_id === meId ? "You" : c.kind === "direct" ? null : nameOf(last.user_id).split(/\s+/)[0];
    return (
      <>
        {who && <span className={c.unread_count ? "font-semibold" : "text-foreground/80"}>{who}: </span>}
        {body}
      </>
    );
  }
  // No preview: either there are no messages, or the previews migration
  // hasn't run yet (then last_message is missing entirely).
  if (c.last_message === null || !c.last_message_at) {
    if (c.kind === "channel") return <>No messages yet. Say hello 👋</>;
    if (c.kind === "group") return <>{c.members.length} members · Say hello 👋</>;
    return <>Say hello 👋</>;
  }
  if (other) return <DirectStatus userId={other.id} />;
  if (c.kind === "group") {
    return <>{c.members.filter((m) => m.id !== meId).map((m) => m.username).join(", ")}</>;
  }
  return <>Channel</>;
}

function DirectStatus({ userId }: { userId: string }) {
  const presence = usePresence(userId);
  return <>{STATUS_LABELS[presence]}</>;
}

function attachmentLabel(count: number, first: { name: string; type: string } | null) {
  if (!first) return "";
  if (first.type.startsWith("image/")) return count > 1 ? `📷 ${count} photos` : "📷 Photo";
  return count > 1 ? `📎 ${count} files` : `📎 ${first.name}`;
}

/** "3:42 PM" today, "Yesterday", "Mon" this week, otherwise "11/3". */
function shortTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (now.getTime() - date.getTime() < 6 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "numeric", day: "numeric" });
}
