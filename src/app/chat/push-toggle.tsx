"use client";

import { useEffect, useState } from "react";
import { BellIcon } from "@/components/icons";
import { getPushState, turnOffPush, turnOnPush, type PushState } from "@/lib/push";

/**
 * "Phone notifications" switch for the user menu. Renders nothing inside an
 * embedding widget or where web push isn't available.
 */
export function PushToggle() {
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPushState().then(setState, () => setState("unavailable"));
  }, []);

  if (state === "loading" || state === "unavailable") return null;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setState(state === "on" ? await turnOffPush() : await turnOnPush());
    } catch {
      setError("Couldn't change notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-border p-1">
      {state === "needs-install" ? (
        <p className="flex gap-3 px-3 py-2 text-xs text-muted">
          <BellIcon className="h-4 w-4 shrink-0" />
          To get notifications on iPhone, tap Share → Add to Home Screen, then open Chat from your
          home screen.
        </p>
      ) : state === "denied" ? (
        <p className="flex gap-3 px-3 py-2 text-xs text-muted">
          <BellIcon className="h-4 w-4 shrink-0" />
          Notifications are blocked. Allow them for this site in your browser settings.
        </p>
      ) : (
        <button
          type="button"
          role="switch"
          aria-checked={state === "on"}
          onClick={toggle}
          disabled={busy}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-hover disabled:opacity-60"
        >
          <BellIcon className="h-4 w-4 text-muted" />
          <span className="flex-1">
            Phone notifications
            <span className="block text-xs text-muted">New 1:1 messages</span>
          </span>
          <span
            aria-hidden="true"
            className={`relative h-5 w-9 shrink-0 rounded-full transition ${state === "on" ? "bg-accent" : "bg-border"}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-[left] ${state === "on" ? "left-4.5" : "left-0.5"}`}
            />
          </span>
        </button>
      )}
      {error && <p className="px-3 py-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
