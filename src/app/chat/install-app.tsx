"use client";

import { useState, useSyncExternalStore } from "react";
import { CloseIcon, DownloadIcon } from "@/components/icons";
import { getInstallState, install, subscribeInstall, type InstallState } from "@/lib/pwa";

const DISMISSED_KEY = "caa-install-dismissed";

function useInstallState(): InstallState {
  // Nothing on the server or during hydration: it depends on the browser.
  return useSyncExternalStore(subscribeInstall, getInstallState, () => null);
}

/** "Install app" in the account menu, when the browser offers it. */
export function InstallMenuItem() {
  const state = useInstallState();
  // iPhone gets its instructions from the banner (and the notifications hint).
  if (state !== "prompt") return null;
  return (
    <div className="rounded-2xl bg-background p-1.5 md:border-t md:border-border md:bg-transparent md:p-0 md:pt-1.5 md:rounded-none">
      <button type="button" onClick={() => void install()} className="menu-row">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text md:h-auto md:w-auto md:bg-transparent md:text-muted">
          <DownloadIcon className="h-[18px] w-[18px] md:h-4 md:w-4" />
        </span>
        <span className="flex-1">
          Install app
          <span className="block text-xs text-muted">Opens full screen from your home screen</span>
        </span>
      </button>
    </div>
  );
}

/** A dismissible card above the chat list suggesting to install the app. */
export function InstallBanner() {
  const state = useInstallState();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (!state || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Private mode or blocked storage: it just shows again next visit.
    }
  }

  return (
    <div className="animate-rise-in mx-3 mb-2 flex items-center gap-3 rounded-2xl bg-linear-to-br from-accent-soft to-surface p-3 ring-1 ring-border">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-soft">
        <DownloadIcon className="h-5 w-5" />
      </span>
      <p className="min-w-0 flex-1 text-sm leading-snug">
        {state === "prompt" ? (
          <>
            <strong className="block font-semibold">Get the app</strong>
            <span className="text-muted">Full screen, faster to open.</span>
          </>
        ) : (
          <>
            <strong className="block font-semibold">Add Chat to your Home Screen</strong>
            <span className="text-muted">
              Tap <strong className="font-semibold text-foreground">Share</strong>, then{" "}
              <strong className="font-semibold text-foreground">Add to Home Screen</strong>.
            </span>
          </>
        )}
      </p>
      {state === "prompt" && (
        <button type="button" onClick={() => void install()} className="btn-primary px-3.5 py-1.5 text-xs">
          Install
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Dismiss" title="Dismiss" className="icon-btn h-8 w-8 pointer-coarse:h-9 pointer-coarse:w-9">
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function readDismissed() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}
