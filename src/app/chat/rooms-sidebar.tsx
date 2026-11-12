"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { HashIcon, PeopleIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { postToParent } from "@/lib/embed";
import { createClient } from "@/lib/supabase/client";
import { subscribeToChannel } from "@/lib/supabase/realtime";
import {
  conversationTitle,
  ROOM_COLUMNS,
  type Conversation,
  type CurrentUser,
  type Message,
  type Room,
} from "@/lib/types";
import { InstallBanner } from "./install-app";
import { NewChatButton } from "./new-chat-dialog";
import { useRoomSearch } from "./room-search";

const activity = (c: Conversation) => c.last_message_at ?? c.created_at;

export function RoomsSidebar({
  me,
  initialConversations,
}: {
  me: CurrentUser;
  initialConversations: Conversation[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { roomId } = useParams<{ roomId?: string }>();
  const { query } = useRoomSearch();
  const [conversations, setConversations] = useState(initialConversations);
  const [channelFormOpen, setChannelFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const knownIdsRef = useRef(new Set(initialConversations.map((c) => c.id)));
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);
  useEffect(() => {
    knownIdsRef.current = new Set(conversations.map((c) => c.id));
  }, [conversations]);

  // Live list: new messages bump chats to the top and add unread badges;
  // new channels or chats you're added to show up instantly.
  useEffect(() => {
    const supabase = createClient();
    let refetchTimer: ReturnType<typeof setTimeout> | undefined;

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

    const unsubscribe = subscribeToChannel(supabase, `sidebar:${me.id}`, { config: {} }, (channel) => {
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "rooms" }, refetch)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "room_members", filter: `user_id=eq.${me.id}` },
          ({ new: row }) => {
            if (!knownIdsRef.current.has((row as { room_id: string }).room_id)) refetch();
          },
        )
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, ({ new: row }) => {
          const msg = row as Message;
          // Badge on the embedding widget (no-op when not embedded).
          if (msg.user_id !== me.id) postToParent({ type: "caa:new-message" });
          if (!knownIdsRef.current.has(msg.room_id)) {
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
                    unread_count: counts ? c.unread_count + 1 : c.unread_count,
                  }
                : c,
            ),
          );
        });
    }, (status) => {
      // Changes made while disconnected (phone asleep, app in the background)
      // never arrive, so reload the list on every (re)connect.
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) refetch();
    });

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

  function closeChannelForm() {
    setChannelFormOpen(false);
    setName("");
    setError(null);
  }

  async function createChannel(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;

    setCreating(true);
    setError(null);
    const { data, error } = await createClient()
      .from("rooms")
      .insert({ name: trimmed, kind: "channel" })
      .select(ROOM_COLUMNS)
      .single<Room>();
    setCreating(false);

    if (error) {
      setError(error.code === "23505" ? "A channel with that name already exists." : error.message);
      return;
    }
    closeChannelForm();
    setConversations((prev) =>
      prev.some((c) => c.id === data.id)
        ? prev
        : [...prev, { ...data, last_message_at: null, unread_count: 0, members: [] }],
    );
    router.push(`/chat/${data.id}`);
  }

  const needle = query.trim().toLowerCase();
  const titled = conversations
    .map((c) => ({ ...c, title: conversationTitle(c, c.members, me.id) }))
    .filter((c) => !needle || c.title.toLowerCase().includes(needle));
  const chats = titled
    .filter((c) => c.kind !== "channel")
    .sort((a, b) => activity(b).localeCompare(activity(a)));
  const channels = titled
    .filter((c) => c.kind === "channel")
    .sort((a, b) => a.title.localeCompare(b.title));
  const hasChannels = conversations.some((c) => c.kind === "channel");
  const showChannelForm = channelFormOpen || !hasChannels;

  return (
    <aside
      className={`${pathname === "/chat" ? "flex" : "hidden md:flex"} w-full flex-col border-r border-border bg-pane md:w-80 md:shrink-0`}
    >
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <h1 className="text-lg font-bold">Chat</h1>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => (channelFormOpen ? closeChannelForm() : setChannelFormOpen(true))}
            aria-expanded={showChannelForm}
            aria-controls="new-channel"
            aria-label="New channel"
            title="New channel"
            className="icon-btn"
          >
            <HashIcon />
          </button>
          <NewChatButton meId={me.id} />
        </div>
      </div>

      <InstallBanner />

      {showChannelForm && (
        <form
          id="new-channel"
          onSubmit={createChannel}
          onKeyDown={(e) => {
            if (e.key === "Escape" && hasChannels) closeChannelForm();
          }}
          className="mx-3 mb-2 space-y-2 rounded-lg border border-border bg-surface p-3 shadow-sm"
        >
          <label htmlFor="new-channel-name" className="block text-xs font-semibold">
            New channel
          </label>
          <input
            id="new-channel-name"
            autoFocus={channelFormOpen}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            placeholder="Give your channel a name"
            className="input"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            {hasChannels && (
              <button type="button" onClick={closeChannelForm} className="btn-secondary">
                Cancel
              </button>
            )}
            <button type="submit" disabled={creating || !name.trim()} className="btn-primary">
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      )}

      <nav className="flex-1 overflow-y-auto overscroll-contain px-2 pb-3" aria-label="Conversations">
        {needle && chats.length === 0 && channels.length === 0 && (
          <p className="px-2 py-3 text-sm text-muted">No chats or channels match “{query.trim()}”.</p>
        )}

        {(chats.length > 0 || !needle) && (
          <Section label="Chats">
            {chats.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted">
                No chats yet. Use the pencil icon to message someone.
              </p>
            ) : (
              chats.map((c) => (
                <ConversationLink
                  key={c.id}
                  conversation={c}
                  title={c.title}
                  active={c.id === roomId}
                  meId={me.id}
                />
              ))
            )}
          </Section>
        )}

        {channels.length > 0 && (
          <Section label="Channels">
            {channels.map((c) => (
              <ConversationLink
                key={c.id}
                conversation={c}
                title={c.title}
                active={c.id === roomId}
                meId={me.id}
              />
            ))}
          </Section>
        )}
      </nav>
    </aside>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-1">
      <h2 className="px-2 pb-1 pt-2 text-xs font-semibold text-muted">{label}</h2>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}

function ConversationLink({
  conversation: c,
  title,
  active,
  meId,
}: {
  conversation: Conversation;
  title: string;
  active: boolean;
  meId: string;
}) {
  const unread = active ? 0 : c.unread_count;
  const other = c.kind === "direct" ? c.members.find((m) => m.id !== meId) : undefined;

  return (
    <li>
      <Link
        href={`/chat/${c.id}`}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-md px-2 py-2 text-sm transition ${
          active
            ? "bg-surface shadow-sm [--avatar-ring:var(--surface)]"
            : "[--avatar-ring:var(--pane)] hover:bg-pane-hover"
        }`}
      >
        {c.kind === "channel" ? (
          <Avatar id={c.id} name={title} shape="square" />
        ) : other ? (
          <PersonAvatar userId={other.id} name={other.username} />
        ) : (
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mine text-accent-text">
            <PeopleIcon className="h-4 w-4" />
          </span>
        )}
        <span className={`min-w-0 flex-1 truncate ${unread || active ? "font-semibold" : ""}`}>
          {title}
        </span>
        {c.last_message_at && (
          <time
            dateTime={c.last_message_at}
            suppressHydrationWarning
            className="shrink-0 text-[11px] text-muted"
          >
            {shortTime(c.last_message_at)}
          </time>
        )}
        {unread > 0 && (
          <span className="min-w-5 shrink-0 rounded-full bg-accent px-1.5 text-center text-[11px] font-bold leading-5 text-accent-foreground">
            {unread > 99 ? "99+" : unread}
            <span className="sr-only"> unread</span>
          </span>
        )}
      </Link>
    </li>
  );
}

/** "3:42 PM" today, "Mon" this week, otherwise "11/3". */
function shortTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (now.getTime() - date.getTime() < 6 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "numeric", day: "numeric" });
}
