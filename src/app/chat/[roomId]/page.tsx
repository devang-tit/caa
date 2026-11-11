import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { MESSAGE_COLUMNS, type ChatMessage, type Message, type Room } from "@/lib/types";
import { ChatRoom } from "./chat-room";

const PAGE_SIZE = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MessageWithProfile = Message & { profiles: { username: string } | null };
type RoomParams = PageProps<"/chat/[roomId]">["params"];

async function getRoom(roomId: string) {
  if (!UUID_RE.test(roomId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("rooms")
    .select("id, name, created_by, created_at")
    .eq("id", roomId)
    .maybeSingle<Room>();
  return data;
}

export async function generateMetadata(
  props: PageProps<"/chat/[roomId]">,
): Promise<Metadata> {
  const { roomId } = await props.params;
  const room = await getRoom(roomId);
  return { title: room ? `#${room.name} · Realtime Chat` : "Realtime Chat" };
}

export default function RoomPage(props: PageProps<"/chat/[roomId]">) {
  return (
    <Suspense fallback={<RoomSkeleton />}>
      <RoomLoader params={props.params} />
    </Suspense>
  );
}

async function RoomLoader({ params }: { params: RoomParams }) {
  const { roomId } = await params;

  const [me, room] = await Promise.all([getCurrentUser(), getRoom(roomId)]);
  if (!me) redirect("/login");
  if (!room) notFound();

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("messages")
    .select(`${MESSAGE_COLUMNS}, profiles(username)`)
    .eq("room_id", room.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE)
    .overrideTypes<MessageWithProfile[], { merge: false }>();

  const initialMessages: ChatMessage[] = (rows ?? [])
    .reverse()
    .map(({ profiles, ...m }) => ({ ...m, username: profiles?.username ?? "Unknown" }));

  return <ChatRoom key={room.id} room={room} initialMessages={initialMessages} me={me} />;
}

function RoomSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="h-[61px] border-b border-border bg-surface" />
      <div className="flex-1 space-y-4 p-4">
        {[60, 40, 75].map((w) => (
          <div key={w} className="flex gap-3">
            <div className="h-9 w-9 animate-pulse rounded-full bg-hover" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-hover" />
              <div className="h-3 animate-pulse rounded bg-hover" style={{ width: `${w}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
