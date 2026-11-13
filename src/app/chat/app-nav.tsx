"use client";

import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { BellIcon, BookmarkIcon, ChatIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { subscribeToChannel } from "@/lib/supabase/realtime";

type Item = {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const ITEMS: Item[] = [
  { href: "/chat", label: "Chats", Icon: ChatIcon },
  { href: "/chat/activity", label: "Activity", Icon: BellIcon },
  { href: "/chat/saved", label: "Saved", Icon: BookmarkIcon },
];

// The desktop rail and the phone tab bar both show the Activity badge; they
// share one Realtime subscription instead of opening one each.
type BadgeEvent = { kind: "new" } | { kind: "count"; count: number };
const badgeListeners = new Set<(event: BadgeEvent) => void>();
let stopBadgeChannel: (() => void) | null = null;

function listenForActivity(meId: string, listener: (event: BadgeEvent) => void) {
  badgeListeners.add(listener);
  if (!stopBadgeChannel) {
    const supabase = createClient();
    const emit = (event: BadgeEvent) => badgeListeners.forEach((l) => l(event));
    stopBadgeChannel = subscribeToChannel(
      supabase,
      `activity-badge:${meId}`,
      { config: {} },
      (channel) => {
        channel.on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${meId}` },
          () => emit({ kind: "new" }),
        );
      },
      (status) => {
        // Recount on every (re)connect: inserts made while disconnected never arrive.
        if (status !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) return;
        void supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .is("read_at", null)
          .then(({ count }) => {
            if (count !== null) emit({ kind: "count", count });
          });
      },
    );
  }
  return () => {
    badgeListeners.delete(listener);
    if (badgeListeners.size === 0) {
      stopBadgeChannel?.();
      stopBadgeChannel = null;
    }
  };
}

function activeHref(pathname: string) {
  if (pathname.startsWith("/chat/activity")) return "/chat/activity";
  if (pathname.startsWith("/chat/saved")) return "/chat/saved";
  return "/chat";
}

/**
 * The desktop icon rail, or the floating tab bar on phones, with a live
 * unread badge on Activity.
 */
export function AppNav({
  variant,
  meId,
  initialUnread,
}: {
  variant: "rail" | "bar";
  meId: string;
  initialUnread: number;
}) {
  const pathname = usePathname();
  const active = activeHref(pathname);
  const [unread, setUnread] = useState(initialUnread);

  // Visiting Activity marks everything read, so clear the badge when we
  // arrive there or leave it (adjusting state during render, not in an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (activeHref(lastPath) === "/chat/activity" || active === "/chat/activity") setUnread(0);
  }

  useEffect(
    () => listenForActivity(meId, (event) => setUnread((n) => (event.kind === "new" ? n + 1 : event.count))),
    [meId],
  );

  const badge = active === "/chat/activity" ? 0 : unread;

  if (variant === "bar") {
    // A conversation gets the whole screen, so no tab bar inside one.
    if (active === "/chat" && pathname !== "/chat") return null;
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:hidden">
        <nav
          aria-label="Apps"
          className="glass pointer-events-auto flex gap-1 rounded-full p-1.5 shadow-float ring-1 ring-border/80"
        >
          {ITEMS.map((item) => (
            <TabLink
              key={item.href}
              item={item}
              active={item.href === active}
              badge={item.href === "/chat/activity" ? badge : 0}
            />
          ))}
        </nav>
      </div>
    );
  }

  return (
    <nav aria-label="Apps" className="hidden w-18 shrink-0 flex-col items-center gap-1.5 py-2 md:flex">
      {ITEMS.map((item) => (
        <RailLink
          key={item.href}
          item={item}
          active={item.href === active}
          badge={item.href === "/chat/activity" ? badge : 0}
        />
      ))}
    </nav>
  );
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-2 min-w-4.5 rounded-full bg-danger px-1 text-center text-[10px] leading-4.5 font-bold text-white ring-2 ring-[color:var(--badge-ring)]">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}

function TabLink({ item, active, badge }: { item: Item; active: boolean; badge: number }) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex min-w-[4.75rem] flex-col items-center gap-0.5 rounded-full px-4 py-1.5 text-[11px] font-semibold transition active:scale-95 [--badge-ring:var(--surface)] ${
        active ? "bg-accent-soft text-accent-text" : "text-muted"
      }`}
    >
      <span className="relative">
        <Icon className={`h-6 w-6 ${active ? "fill-current/15" : ""}`} strokeWidth={active ? 2 : 1.6} />
        <Badge count={badge} />
      </span>
      {item.label}
    </Link>
  );
}

function RailLink({ item, active, badge }: { item: Item; active: boolean; badge: number }) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="group flex w-full flex-col items-center gap-1 py-1 text-[11px] font-semibold [--badge-ring:var(--rail)]"
    >
      <span
        className={`relative flex h-10 w-12 items-center justify-center rounded-2xl transition ${
          active ? "bg-accent-soft text-accent-text" : "text-muted group-hover:bg-hover group-hover:text-foreground"
        }`}
      >
        <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2 : 1.6} />
        <Badge count={badge} />
      </span>
      <span className={active ? "text-accent-text" : "text-muted group-hover:text-foreground"}>
        {item.label}
      </span>
    </Link>
  );
}

/** Static version for the prerendered shell (no active state or badge). */
export function AppNavFallback() {
  return (
    <nav aria-label="Apps" className="hidden w-18 shrink-0 flex-col items-center gap-1.5 py-2 md:flex">
      {ITEMS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex w-full flex-col items-center gap-1 py-1 text-[11px] font-semibold text-muted"
        >
          <span className="flex h-10 w-12 items-center justify-center rounded-2xl">
            <Icon className="h-[22px] w-[22px]" />
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );
}
