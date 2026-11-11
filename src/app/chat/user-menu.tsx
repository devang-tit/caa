"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, StatusDot } from "@/components/avatar";
import { CheckIcon, SignOutIcon } from "@/components/icons";
import { useMe, useSetLocalProfile } from "@/components/session-provider";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LABELS, type Status } from "@/lib/types";

const STATUSES: Status[] = ["available", "busy", "dnd", "away"];

/** Avatar button in the top bar; opens a native popover with status + sign out. */
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
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        popoverTarget="user-menu"
        aria-label={`Account menu for ${me.username}, ${STATUS_LABELS[me.status]}`}
        className="rounded-full p-0.5 transition hover:bg-hover"
      >
        <Avatar id={me.id} name={me.username} status={me.status} />
      </button>

      <div
        id="user-menu"
        popover="auto"
        className="fixed inset-auto right-2 top-12 m-0 w-72 rounded-lg border border-border bg-surface p-0 text-foreground shadow-xl [--avatar-ring:var(--surface)]"
      >
        <div className="flex items-center gap-3 p-4">
          <Avatar id={me.id} name={me.username} size="lg" status={me.status} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{me.username}</p>
            <p className="text-xs text-muted">{STATUS_LABELS[me.status]}</p>
          </div>
        </div>

        <div className="border-t border-border p-1" role="group" aria-label="Set status">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatus(status)}
              aria-pressed={me.status === status}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-hover"
            >
              <StatusDot status={status} className="h-2.5 w-2.5" />
              <span className="flex-1">{STATUS_LABELS[status]}</span>
              {me.status === status && <CheckIcon className="h-4 w-4 text-accent-text" />}
            </button>
          ))}
          {error && <p className="px-3 py-1 text-xs text-danger">{error}</p>}
        </div>

        <div className="border-t border-border p-1">
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-hover"
          >
            <SignOutIcon className="h-4 w-4 text-muted" />
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
