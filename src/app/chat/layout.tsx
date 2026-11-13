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
import { UserMenu, UserMenuButton, UserMenuButtonFallback } from "./user-menu";

// The layout itself stays static so it's part of the prerendered shell.
// Session queries start here without being awaited; the components that
// need them unwrap the promises behind their own <Suspense>.
//
// Phones: one full-screen view at a time (chat list, a conversation,
// Activity, Saved), each with its own header, and a floating tab bar.
// Desktop: top bar with search, an icon rail, the chat list and the view.
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
        <div className="relative flex h-dvh flex-col overflow-hidden bg-pane pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] md:bg-rail">
          <header className="hidden h-14 shrink-0 items-center gap-3 pr-4 [--avatar-ring:var(--rail)] md:flex">
            <div className="flex w-18 shrink-0 justify-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-accent to-accent-hover text-accent-foreground shadow-soft">
                <ChatIcon className="h-5 w-5 fill-current/20" strokeWidth={1.9} />
              </span>
            </div>
            <span className="embed-hide -ml-3 hidden shrink-0 text-[15px] font-semibold tracking-tight lg:block">
              Realtime Chat
            </span>
            <RoomSearchBox />
            <Suspense fallback={<UserMenuButtonFallback />}>
              <UserMenuButton />
            </Suspense>
          </header>

          <div className="flex min-h-0 flex-1">
            <Suspense fallback={<AppNavFallback />}>
              <Nav variant="rail" />
            </Suspense>

            <div className="flex min-w-0 flex-1 overflow-hidden md:rounded-tl-3xl md:border-t md:border-l md:border-border md:bg-pane">
              <Suspense fallback={<SidebarSkeleton />}>
                <Sidebar />
              </Suspense>
              <main className="flex min-w-0 flex-1 flex-col bg-background">{children}</main>
            </div>
          </div>

          <Suspense fallback={null}>
            <Nav variant="bar" />
          </Suspense>

          <Suspense fallback={null}>
            <UserMenu />
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
    <aside className="hidden w-80 shrink-0 flex-col border-r border-border bg-pane md:flex lg:w-[22rem]">
      <div className="flex h-16 items-center px-5">
        <span className="text-xl font-bold tracking-tight">Chats</span>
      </div>
      <div className="flex gap-2 px-5 pb-3">
        {[40, 64, 52, 76].map((w) => (
          <span key={w} className="h-8 animate-pulse rounded-full bg-hover" style={{ width: w }} />
        ))}
      </div>
      <div className="space-y-1 px-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <div className="h-12 w-12 animate-pulse rounded-full bg-hover" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/5 animate-pulse rounded bg-hover" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-hover" />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
