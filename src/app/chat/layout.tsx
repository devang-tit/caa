import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { Room } from "@/lib/types";
import { RoomsSidebar } from "./rooms-sidebar";

// The layout itself stays static so it's part of the prerendered shell;
// only the session-dependent sidebar streams in behind <Suspense>.
export default function ChatLayout({ children }: LayoutProps<"/chat">) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <Suspense fallback={<SidebarSkeleton />}>
        <Sidebar />
      </Suspense>
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}

async function Sidebar() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const { data: rooms } = await supabase
    .from("rooms")
    .select("id, name, created_by, created_at")
    .order("created_at", { ascending: true })
    .overrideTypes<Room[], { merge: false }>();

  return <RoomsSidebar initialRooms={rooms ?? []} me={me} />;
}

function SidebarSkeleton() {
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <span className="text-lg">💬</span>
        <span className="font-semibold">Realtime Chat</span>
      </div>
      <div className="space-y-2 p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-7 animate-pulse rounded-lg bg-hover" />
        ))}
      </div>
    </aside>
  );
}
