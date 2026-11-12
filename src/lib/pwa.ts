/**
 * Installable app (PWA): service worker registration and the install prompt.
 *
 * Nothing here runs inside an embedding widget (an iframe): the host page
 * must never get an install prompt or a service worker from us.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState =
  | "prompt" // the browser offered to install (Android, desktop Chrome/Edge)
  | "ios" // iPhone/iPad: only by hand, via Share → Add to Home Screen
  | null; // installed already, embedded, or not installable

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function isFramed() {
  return window.self !== window.top;
}

export function isIos() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Called once from the root layout. Returns a cleanup. */
export function startPwa(): () => void {
  if (isFramed()) return () => {};

  const onPrompt = (event: Event) => {
    event.preventDefault(); // we show our own Install button instead
    deferred = event as InstallPromptEvent;
    notify();
  };
  const onInstalled = () => {
    deferred = null;
    notify();
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);

  // Dev builds aren't hashed, so a caching worker would serve stale code.
  if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {});
  }

  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInstallState(): InstallState {
  if (isFramed() || isInstalled()) return null;
  if (deferred) return "prompt";
  return isIos() ? "ios" : null;
}

/** Shows the browser's install dialog. Call it straight from a click. */
export async function install() {
  const event = deferred;
  if (!event) return;
  deferred = null;
  notify();
  await event.prompt();
}
