import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ChatIcon } from "@/components/icons";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { Room } from "@/lib/types";
import { RoomSearchBox, RoomSearchProvider } from "./room-search";
import { RoomsSidebar } from "./rooms-sidebar";
import { UserMenu } from "./user-menu";

// The layout itself stays static so it's part of the prerendered shell;
// only the session-dependent pieces (rooms list, account menu) stream in
// behind <Suspense>.
export default function ChatLayout({ children }: LayoutProps<"/chat">) {
  return (
    <RoomSearchProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-rail">
        <header className="flex h-12 shrink-0 items-center gap-3 pr-3 [--avatar-ring:var(--rail)]">
          <div className="flex shrink-0 items-center gap-2 pl-3 md:w-17 md:justify-center md:pl-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <ChatIcon className="h-4 w-4 fill-current" />
            </span>
          </div>
          <span className="-ml-1 hidden shrink-0 text-sm font-semibold sm:block md:-ml-3">
            Realtime Chat
          </span>
          <RoomSearchBox />
          <Suspense fallback={<span className="h-9 w-9 animate-pulse rounded-full bg-border" />}>
            <CurrentUserMenu />
          </Suspense>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav aria-label="Apps" className="hidden w-17 shrink-0 flex-col items-center py-1 md:flex">
            <Link
              href="/chat"
              aria-current="page"
              className="relative flex w-full flex-col items-center gap-0.5 py-2 text-[10px] font-semibold text-accent-text before:absolute before:left-0 before:top-1/2 before:h-8 before:w-[3px] before:-translate-y-1/2 before:rounded-r before:bg-accent-text"
            >
              <ChatIcon className="h-6 w-6 fill-current" />
              Chat
            </Link>
          </nav>

          <div className="flex min-w-0 flex-1 overflow-hidden border-border md:rounded-tl-lg md:border-l md:border-t">
            <Suspense fallback={<SidebarSkeleton />}>
              <Sidebar />
            </Suspense>
            <main className="flex min-w-0 flex-1 flex-col bg-background">{children}</main>
          </div>
        </div>
      </div>
    </RoomSearchProvider>
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

  return <RoomsSidebar initialRooms={rooms ?? []} />;
}

async function CurrentUserMenu() {
  const me = await getCurrentUser();
  return me ? <UserMenu me={me} /> : null;
}

function SidebarSkeleton() {
  return (
    <aside className="hidden w-80 shrink-0 flex-col border-r border-border bg-pane md:flex">
      <div className="flex h-14 items-center px-4">
        <span className="text-lg font-bold">Chat</span>
      </div>
      <div className="space-y-1 px-2 pt-7">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <div className="h-8 w-8 animate-pulse rounded-md bg-border" />
            <div className="h-3 flex-1 animate-pulse rounded bg-border" />
          </div>
        ))}
      </div>
    </aside>
  );
}
