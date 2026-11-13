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
    <div className="rounded-2xl bg-background p-1.5 md:border-t md:border-border md:bg-transparent md:p-0 md:pt-1.5 md:rounded-none">
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
          className="menu-row disabled:opacity-60"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text md:h-auto md:w-auto md:bg-transparent md:text-muted">
            <BellIcon className="h-[18px] w-[18px] md:h-4 md:w-4" />
          </span>
          <span className="flex-1">
            Phone notifications
            <span className="block text-xs text-muted">New 1:1 messages</span>
          </span>
          <span
            aria-hidden="true"
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors md:h-5 md:w-9 ${state === "on" ? "bg-success" : "bg-border"}`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-[left] duration-300 ease-spring md:h-4 md:w-4 ${state === "on" ? "left-5.5 md:left-4.5" : "left-0.5"}`}
            />
          </span>
        </button>
      )}
      {error && <p className="px-3 py-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
