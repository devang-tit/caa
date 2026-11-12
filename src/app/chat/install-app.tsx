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
    <div className="border-t border-border p-1">
      <button
        type="button"
        onClick={() => void install()}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-hover"
      >
        <DownloadIcon className="h-4 w-4 text-muted" />
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
    <div className="mx-3 mb-2 flex items-center gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm">
      <DownloadIcon className="h-5 w-5 shrink-0 text-accent-text" />
      <p className="min-w-0 flex-1 text-sm">
        {state === "prompt" ? (
          "Install Chat for full-screen use and faster loading."
        ) : (
          <>
            Install Chat: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
          </>
        )}
      </p>
      {state === "prompt" && (
        <button type="button" onClick={() => void install()} className="btn-primary px-2.5 py-1 text-xs">
          Install
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Dismiss" title="Dismiss" className="icon-btn h-7 w-7">
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
