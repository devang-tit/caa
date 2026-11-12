"use client";

import { useSyncExternalStore } from "react";
import { TimerIcon } from "@/components/icons";
import { DISAPPEAR_AFTER_MS, disappearsAt } from "@/lib/types";

// One clock for every countdown on the page, ticking once a second while any
// countdown is showing.
let now = 0;
let ticker: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!ticker) {
    now = Date.now();
    ticker = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(ticker);
      ticker = undefined;
    }
  };
}

const getSnapshot = () => now;
// Nothing on the server or during hydration: the time left depends on the clock.
const getServerSnapshot = () => 0;

/** "1:45" until a seen 1:1 message disappears. */
export function DisappearTimer({ seenAt }: { seenAt: string }) {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!current) return null;

  const left = Math.min(DISAPPEAR_AFTER_MS, Math.max(0, disappearsAt(seenAt) - current));
  const seconds = Math.ceil(left / 1000);
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <span
      role="timer"
      aria-label={`Disappears in ${label}`}
      title="Seen. This message disappears when the timer runs out."
      className="flex items-center gap-0.5 tabular-nums"
    >
      <TimerIcon className="h-3 w-3" />
      {label}
    </span>
  );
}
