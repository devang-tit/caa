import { EMBED_ORIGINS } from "@/lib/embed-origins";

/**
 * Bridge to a chat widget that shows this app in an iframe (e.g. a widget in
 * another app you run locally). Does nothing unless embedding is on and the
 * app really is framed.
 *
 * No chat content ever crosses the frame; only these messages:
 *   to parent:   { type: "caa:ready" }        on load, so the widget sends its state
 *   to parent:   { type: "caa:new-message" }  someone else sent a message (badge)
 *   to parent:   { type: "caa:hide" }         hide shortcut pressed inside the chat
 *   from parent: { type: "caa-widget:shown", shown: boolean }  panel opened / closed
 */

/** The widget's hide-everything shortcut: Alt+Shift+H (same check in the widget). */
export function isHideShortcut(e: KeyboardEvent): boolean {
  return e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyH";
}

const embedded =
  typeof window !== "undefined" && EMBED_ORIGINS.length > 0 && window.parent !== window;

// Until the widget says otherwise, assume its panel is closed, so nothing is
// marked read (and shown to others as "Seen") while nobody is looking.
let panelShown = false;
const listeners = new Set<() => void>();
let parentOrigin: string | null = null;

if (embedded) {
  const guess = window.location.ancestorOrigins?.[0] ?? referrerOrigin();
  parentOrigin = guess && EMBED_ORIGINS.includes(guess) ? guess : null;

  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== window.parent || !EMBED_ORIGINS.includes(e.origin)) return;
    parentOrigin = e.origin;
    const data = e.data as { type?: unknown; shown?: unknown } | null;
    if (data?.type !== "caa-widget:shown" || typeof data.shown !== "boolean") return;
    panelShown = data.shown;
    listeners.forEach((cb) => cb());
  });

  // Keys typed in the chat never reach the host page, so pass the shortcut on.
  window.addEventListener("keydown", (e) => {
    if (!isHideShortcut(e)) return;
    e.preventDefault();
    postToParent({ type: "caa:hide" });
  });

  postToParent({ type: "caa:ready" });
}

function referrerOrigin(): string | null {
  try {
    return document.referrer ? new URL(document.referrer).origin : null;
  } catch {
    return null;
  }
}

export function postToParent(data: { type: "caa:ready" | "caa:new-message" | "caa:hide" }) {
  if (!embedded) return;
  // The browser drops the message unless the parent is exactly that origin.
  for (const origin of parentOrigin ? [parentOrigin] : EMBED_ORIGINS) {
    window.parent.postMessage(data, origin);
  }
}

/** Whether the user can actually see the chat right now. */
export function isChatVisible(): boolean {
  return document.visibilityState === "visible" && (!embedded || panelShown);
}

/** Calls cb whenever isChatVisible() may have changed. Returns an unsubscribe. */
export function onChatVisibilityChange(cb: () => void): () => void {
  document.addEventListener("visibilitychange", cb);
  listeners.add(cb);
  return () => {
    document.removeEventListener("visibilitychange", cb);
    listeners.delete(cb);
  };
}
