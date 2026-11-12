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
  { href: "/chat/activity", label: "Activity", Icon: BellIcon },
  { href: "/chat", label: "Chat", Icon: ChatIcon },
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
 * Teams' left app bar (desktop) or bottom tab bar (phones), with a live
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
    // Hide the tab bar inside a conversation, like Teams on mobile.
    if (active === "/chat" && pathname !== "/chat") return null;
    return (
      <nav
        aria-label="Apps"
        className="flex shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={item.href === active} badge={item.href === "/chat/activity" ? badge : 0} compact />
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Apps" className="hidden w-17 shrink-0 flex-col items-center gap-1 py-1 md:flex">
      {ITEMS.map((item) => (
        <NavLink key={item.href} item={item} active={item.href === active} badge={item.href === "/chat/activity" ? badge : 0} />
      ))}
    </nav>
  );
}

function NavLink({
  item,
  active,
  badge,
  compact = false,
}: {
  item: Item;
  active: boolean;
  badge: number;
  compact?: boolean;
}) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition md:w-full md:flex-none ${
        active ? "text-accent-text" : "text-muted hover:text-foreground"
      } ${
        active && !compact
          ? "before:absolute before:left-0 before:top-1/2 before:h-8 before:w-[3px] before:-translate-y-1/2 before:rounded-r before:bg-accent-text"
          : ""
      }`}
    >
      <span className="relative">
        <Icon className={`h-6 w-6 ${active ? "fill-current" : ""}`} />
        {badge > 0 && (
          <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-rail">
            {badge > 99 ? "99+" : badge}
            <span className="sr-only"> unread</span>
          </span>
        )}
      </span>
      {item.label}
    </Link>
  );
}

/** Static version for the prerendered shell (no active state or badge). */
export function AppNavFallback() {
  return (
    <nav aria-label="Apps" className="hidden w-17 shrink-0 flex-col items-center gap-1 py-1 md:flex">
      {ITEMS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex w-full flex-col items-center gap-0.5 py-2 text-[10px] font-semibold text-muted"
        >
          <Icon className="h-6 w-6" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
