import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ChatIcon } from "@/components/icons";
import { SessionProvider } from "@/components/session-provider";
import {
  getConversations,
  getCurrentUser,
  getPeople,
  getUnreadActivityCount,
} from "@/lib/supabase/server";
import { AppNav, AppNavFallback } from "./app-nav";
import { RoomSearchBox, RoomSearchProvider } from "./room-search";
import { RoomsSidebar } from "./rooms-sidebar";
import { UserMenu } from "./user-menu";

// The layout itself stays static so it's part of the prerendered shell.
// Session queries start here without being awaited; the components that
// need them unwrap the promises behind their own <Suspense>.
export default function ChatLayout({ children }: LayoutProps<"/chat">) {
  const mePromise = getCurrentUser();
  const peoplePromise = getPeople();
  const conversationsPromise = getConversations();

  return (
    <SessionProvider
      mePromise={mePromise}
      peoplePromise={peoplePromise}
      conversationsPromise={conversationsPromise}
    >
      <RoomSearchProvider>
        <div className="flex h-dvh flex-col overflow-hidden bg-rail">
          <header className="flex h-12 shrink-0 items-center gap-3 pr-3 [--avatar-ring:var(--rail)]">
            <div className="flex shrink-0 items-center gap-2 pl-3 md:w-17 md:justify-center md:pl-0">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <ChatIcon className="h-4 w-4 fill-current" />
              </span>
            </div>
            <span className="embed-hide -ml-1 hidden shrink-0 text-sm font-semibold sm:block md:-ml-3">
              Realtime Chat
            </span>
            <RoomSearchBox />
            <Suspense fallback={<span className="h-9 w-9 animate-pulse rounded-full bg-border" />}>
              <UserMenu />
            </Suspense>
          </header>

          <div className="flex min-h-0 flex-1">
            <Suspense fallback={<AppNavFallback />}>
              <Nav variant="rail" />
            </Suspense>

            <div className="flex min-w-0 flex-1 overflow-hidden border-border md:rounded-tl-lg md:border-l md:border-t">
              <Suspense fallback={<SidebarSkeleton />}>
                <Sidebar />
              </Suspense>
              <main className="flex min-w-0 flex-1 flex-col bg-background">{children}</main>
            </div>
          </div>

          <Suspense fallback={null}>
            <Nav variant="bar" />
          </Suspense>
        </div>
      </RoomSearchProvider>
    </SessionProvider>
  );
}

async function Sidebar() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const conversations = await getConversations();
  return <RoomsSidebar me={me} initialConversations={conversations} />;
}

async function Nav({ variant }: { variant: "rail" | "bar" }) {
  const me = await getCurrentUser();
  if (!me) return variant === "rail" ? <AppNavFallback /> : null;
  const unread = await getUnreadActivityCount();
  return <AppNav variant={variant} meId={me.id} initialUnread={unread} />;
}

function SidebarSkeleton() {
  return (
    <aside className="hidden w-80 shrink-0 flex-col border-r border-border bg-pane md:flex">
      <div className="flex h-14 items-center px-4">
        <span className="text-lg font-bold">Chat</span>
      </div>
      <div className="space-y-1 px-2 pt-7">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <div className="h-8 w-8 animate-pulse rounded-full bg-border" />
            <div className="h-3 flex-1 animate-pulse rounded bg-border" />
          </div>
        ))}
      </div>
    </aside>
  );
}
