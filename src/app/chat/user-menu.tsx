"use client";

import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { SignOutIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import type { CurrentUser } from "@/lib/types";

/** Avatar button in the top bar; opens a native popover with account actions. */
export function UserMenu({ me }: { me: CurrentUser }) {
  const router = useRouter();

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
        aria-label={`Account menu for ${me.username}`}
        className="rounded-full p-0.5 transition hover:bg-hover"
      >
        <Avatar id={me.id} name={me.username} presence />
      </button>

      <div
        id="user-menu"
        popover="auto"
        className="fixed inset-auto right-2 top-12 m-0 w-64 rounded-lg border border-border bg-surface p-0 text-foreground shadow-xl [--avatar-ring:var(--surface)]"
      >
        <div className="flex items-center gap-3 p-4">
          <Avatar id={me.id} name={me.username} size="lg" presence />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{me.username}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <span className="h-2 w-2 rounded-full bg-success" />
              Online
            </p>
          </div>
        </div>
        <div className="border-t border-border p-1">
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition hover:bg-hover"
          >
            <SignOutIcon className="h-4 w-4 text-muted" />
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
