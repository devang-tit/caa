"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, StatusDot } from "@/components/avatar";
import { CheckIcon, SignOutIcon } from "@/components/icons";
import { useMe, useSetLocalProfile } from "@/components/session-provider";
import { turnOffPush } from "@/lib/push";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LABELS, type Status } from "@/lib/types";
import { InstallMenuItem } from "./install-app";
import { PushToggle } from "./push-toggle";

const STATUSES: Status[] = ["available", "busy", "dnd", "away"];
const MENU_ID = "user-menu";

/**
 * Your avatar; opens the account sheet. Several can exist (desktop top bar,
 * phone screen headers): they all open the one <UserMenu />.
 * Suspends: use behind <Suspense>.
 */
export function UserMenuButton({ className = "" }: { className?: string }) {
  const me = useMe();
  if (!me) return null;
  return (
    <button
      type="button"
      popoverTarget={MENU_ID}
      aria-label={`Account menu for ${me.username}, ${STATUS_LABELS[me.status]}`}
      className={`shrink-0 rounded-full p-0.5 transition hover:bg-hover active:scale-95 ${className}`}
    >
      <Avatar id={me.id} name={me.username} status={me.status} />
    </button>
  );
}

export function UserMenuButtonFallback({ className = "" }: { className?: string }) {
  return <span className={`h-10 w-10 shrink-0 animate-pulse rounded-full bg-hover ${className}`} />;
}

/** Account sheet (phones) / dropdown card (desktop): status, app settings, sign out. */
export function UserMenu() {
  const router = useRouter();
  const me = useMe();
  const setLocalProfile = useSetLocalProfile();
  const [error, setError] = useState<string | null>(null);

  if (!me) return null;

  async function setStatus(status: Status) {
    if (!me || status === me.status) return;
    const previous = me.status;
    setError(null);
    setLocalProfile({ id: me.id, username: me.username, status });
    const { error } = await createClient().from("profiles").update({ status }).eq("id", me.id);
    if (error) {
      setLocalProfile({ id: me.id, username: me.username, status: previous });
      setError("Couldn't update your status.");
    }
  }

  async function signOut() {
    // A signed-out phone shouldn't keep showing your messages. Runs before
    // signOut() because removing the saved subscription needs the session.
    await turnOffPush().catch(() => {});
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div
      id={MENU_ID}
      popover="auto"
      aria-label="Account"
      className="sheet fixed inset-x-0 top-auto bottom-0 m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-[28px] border-0 bg-surface p-0 pb-[max(1rem,env(safe-area-inset-bottom))] text-foreground shadow-float [--avatar-ring:var(--surface)] md:inset-auto md:top-15 md:right-3 md:w-80 md:rounded-2xl md:pb-2 md:ring-1 md:ring-border"
    >
      <div className="grabber" />

      <div className="flex flex-col items-center gap-2 px-6 pt-4 pb-5 text-center md:flex-row md:px-4 md:pt-4 md:pb-3 md:text-left">
        <Avatar id={me.id} name={me.username} size="xl" status={me.status} className="md:hidden" />
        <Avatar id={me.id} name={me.username} size="lg" status={me.status} className="hidden md:inline-flex" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold md:text-sm">{me.username}</p>
          <p className="flex items-center justify-center gap-1.5 text-sm text-muted md:justify-start md:text-xs">
            <StatusDot status={me.status} className="h-2 w-2" />
            {STATUS_LABELS[me.status]}
          </p>
        </div>
      </div>

      <div className="space-y-3 px-4 md:space-y-2 md:px-2">
        <section aria-labelledby="status-heading" className="rounded-2xl bg-background p-1.5 md:bg-transparent md:p-0">
          <h2 id="status-heading" className="px-2.5 pt-1.5 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Status
          </h2>
          <div className="grid grid-cols-2 gap-1.5 p-1 md:grid-cols-1 md:gap-0.5 md:p-0" role="group" aria-label="Set status">
            {STATUSES.map((status) => {
              const active = me.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatus(status)}
                  aria-pressed={active}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition md:py-2 md:font-normal ${
                    active
                      ? "bg-surface shadow-soft ring-1 ring-accent-text/40 md:bg-accent-soft md:shadow-none md:ring-0"
                      : "hover:bg-hover"
                  }`}
                >
                  <StatusDot status={status} className="h-2.5 w-2.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{STATUS_LABELS[status]}</span>
                  {active && <CheckIcon className="h-4 w-4 shrink-0 text-accent-text" />}
                </button>
              );
            })}
          </div>
          {error && <p className="px-3 py-1 text-xs text-danger">{error}</p>}
        </section>

        <InstallMenuItem />
        <PushToggle />

        <div className="rounded-2xl bg-background p-1.5 md:border-t md:border-border md:bg-transparent md:p-0 md:pt-1.5 md:rounded-none">
          <button type="button" onClick={signOut} className="menu-row text-danger">
            <SignOutIcon className="h-5 w-5 md:h-4 md:w-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
