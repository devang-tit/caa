import { createClient } from "@/lib/supabase/client";

/**
 * Phone notifications (Web Push) for this browser.
 *
 * Only offered on the website itself: inside an embedding widget (an iframe)
 * the switch is hidden, so the host page never pops up notifications.
 * Sending happens server side in app/api/push/route.ts.
 */

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export type PushState =
  | "unavailable" // framed, not configured, or the browser can't do push
  | "needs-install" // iPhone/iPad Safari tab: add to Home Screen first
  | "denied" // notifications blocked in browser settings
  | "on"
  | "off";

function isFramed() {
  return window.self !== window.top;
}

function isIos() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function canPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function getPushState(): Promise<PushState> {
  if (isFramed() || !PUBLIC_KEY) return "unavailable";
  if (!canPush()) return isIos() && !isInstalled() ? "needs-install" : "unavailable";
  if (Notification.permission === "denied") return "denied";
  return (await currentSubscription()) ? "on" : "off";
}

/** Call straight from a click: browsers only show the permission prompt then. */
export async function turnOnPush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY!),
    }));

  const keys = subscription.toJSON().keys ?? {};
  const { error } = await createClient().rpc("save_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
  });
  if (error) {
    await subscription.unsubscribe();
    throw new Error(error.message);
  }
  return "on";
}

/** Stops notifications on this browser only; other devices keep theirs. */
export async function turnOffPush(): Promise<PushState> {
  if (!canPush()) return "off";
  const subscription = await currentSubscription();
  if (subscription) {
    await createClient().from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    await subscription.unsubscribe();
  }
  return "off";
}

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
