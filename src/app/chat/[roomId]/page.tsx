import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache, Suspense } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  MESSAGE_COLUMNS,
  MESSAGE_WITH_REACTIONS,
  ROOM_COLUMNS,
  splitReactions,
  type Message,
  type MessagePreview,
  type MessageWithReactions,
  type Room,
  type RoomMember,
} from "@/lib/types";
import { ChatRoom } from "./chat-room";

const PAGE_SIZE = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


// Cached per request: generateMetadata and the page both need it.
const getRoom = cache(async (roomId: string) => {
  if (!UUID_RE.test(roomId)) return null;
  const supabase = await createClient();
  // RLS hides private chats you're not in, so they 404 like missing rooms.
  const { data } = await supabase
    .from("rooms")
    .select(ROOM_COLUMNS)
    .eq("id", roomId)
    .maybeSingle<Room>();
  return data;
});

export async function generateMetadata(
  props: PageProps<"/chat/[roomId]">,
): Promise<Metadata> {
  const { roomId } = await props.params;
  const room = await getRoom(roomId);
  if (!room) return { title: "Realtime Chat" };
  return { title: room.kind === "channel" ? `#${room.name} · Realtime Chat` : "Chat · Realtime Chat" };
}

export default function RoomPage(props: PageProps<"/chat/[roomId]">) {
  return (
    <Suspense fallback={<RoomSkeleton />}>
      <RoomLoader params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function RoomLoader({
  params,
  searchParams,
}: {
  params: PageProps<"/chat/[roomId]">["params"];
  searchParams: PageProps<"/chat/[roomId]">["searchParams"];
}) {
  const [{ roomId }, query] = await Promise.all([params, searchParams]);
  const focusId = typeof query.m === "string" && UUID_RE.test(query.m) ? query.m : null;

  if (!UUID_RE.test(roomId)) notFound();
  const supabase = await createClient();

  // One round trip: the room and its contents load together. RLS returns
  // nothing for a conversation you can't see, and that 404s below.
  const [me, room, latestRes, membersRes, pinnedRes, savedRes] = await Promise.all([
    getCurrentUser(),
    getRoom(roomId),
    supabase
      .from("messages")
      .select(MESSAGE_WITH_REACTIONS)
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE)
      .overrideTypes<MessageWithReactions[], { merge: false }>(),
    // Members only matter in private chats (channel rows just track reads).
    supabase
      .from("room_members")
      .select("room_id, user_id, last_read_at, rooms!inner(kind)")
      .eq("room_id", roomId)
      .neq("rooms.kind", "channel")
      .overrideTypes<(RoomMember & { rooms: unknown })[], { merge: false }>(),
    supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("room_id", roomId)
      .not("pinned_at", "is", null)
      .order("pinned_at", { ascending: false })
      .limit(20)
      .overrideTypes<Message[], { merge: false }>(),
    supabase
      .from("saved_messages")
      .select("message_id, messages!inner(room_id)")
      .eq("messages.room_id", roomId)
      .overrideTypes<{ message_id: string }[], { merge: false }>(),
  ]);
  if (!me) redirect("/login");
  if (!room) notFound();
  const members: RoomMember[] = (membersRes.data ?? []).map(({ room_id, user_id, last_read_at }) => ({
    room_id,
    user_id,
    last_read_at,
  }));

  let rows = (latestRes.data ?? []).slice().reverse();
  let hasOlder = rows.length === PAGE_SIZE;

  // Jumping to a message (search, Activity, Saved) that isn't in the latest
  // page: load a window starting a little before it instead.
  if (focusId && !rows.some((m) => m.id === focusId)) {
    const { data: target } = await supabase
      .from("messages")
      .select("created_at")
      .eq("id", focusId)
      .eq("room_id", room.id)
      .maybeSingle<{ created_at: string }>();
    if (target) {
      const [olderRes, newerRes] = await Promise.all([
        supabase
          .from("messages")
          .select(MESSAGE_WITH_REACTIONS)
          .eq("room_id", room.id)
          .lt("created_at", target.created_at)
          .order("created_at", { ascending: false })
          .limit(15)
          .overrideTypes<MessageWithReactions[], { merge: false }>(),
        supabase
          .from("messages")
          .select(MESSAGE_WITH_REACTIONS)
          .eq("room_id", room.id)
          .gte("created_at", target.created_at)
          .order("created_at", { ascending: true })
          .limit(300)
          .overrideTypes<MessageWithReactions[], { merge: false }>(),
      ]);
      const older = (olderRes.data ?? []).slice().reverse();
      rows = [...older, ...(newerRes.data ?? [])];
      hasOlder = older.length === 15;
    }
  }

  const { messages, reactions } = splitReactions(rows);

  // Quotes for replies whose original isn't in the loaded window.
  const loaded = new Set(messages.map((m) => m.id));
  const missingParents = [
    ...new Set(messages.map((m) => m.reply_to).filter((id): id is string => !!id && !loaded.has(id))),
  ];
  const { data: parents } = missingParents.length
    ? await supabase
        .from("messages")
        .select("id, user_id, content, attachments")
        .in("id", missingParents)
        .overrideTypes<MessagePreview[], { merge: false }>()
    : { data: [] as MessagePreview[] };

  return (
    <ChatRoom
      key={`${room.id}:${focusId ?? ""}`}
      room={room}
      me={me}
      initialMessages={messages}
      initialReactions={reactions}
      initialParents={parents ?? []}
      initialMembers={members}
      initialPinned={pinnedRes.data ?? []}
      initialSavedIds={(savedRes.data ?? []).map((s) => s.message_id)}
      initialHasOlder={hasOlder}
      focusId={focusId}
    />
  );
}

function RoomSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-border bg-surface px-4">
        <div className="h-10 w-10 animate-pulse rounded-full bg-hover" />
        <div className="space-y-1.5">
          <div className="h-3 w-32 animate-pulse rounded bg-hover" />
          <div className="h-2.5 w-16 animate-pulse rounded bg-hover" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-4xl flex-1 space-y-3 px-3 py-5 sm:px-6">
        {[
          { w: 55, mine: false },
          { w: 40, mine: true },
          { w: 70, mine: false },
          { w: 35, mine: true },
        ].map(({ w, mine }, i) => (
          <div key={i} className={`flex ${mine ? "justify-end" : ""}`}>
            <div
              className={`h-11 animate-pulse rounded-[20px] ${mine ? "rounded-br-[6px] bg-accent/25" : "rounded-bl-[6px] bg-surface shadow-soft"}`}
              style={{ width: `${w}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
