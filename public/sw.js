// Service worker for phone notifications (Web Push).
// Registered only by the "Phone notifications" switch in the user menu, which
// never shows inside an embedding widget. Payloads come from app/api/push.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(show(data));
});

async function show(data) {
  const url = data.url || "/chat";
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  // Already looking at this chat: the message is on screen, no need to buzz.
  const viewing = windows.some(
    (w) => w.focused && w.visibilityState === "visible" && new URL(w.url).pathname === url,
  );
  if (viewing) return;

  await self.registration.showNotification(data.title || "New message", {
    body: data.body || "",
    tag: data.tag || url, // one notification per chat; a newer one replaces it
    renotify: true,
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    data: { url },
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/chat", self.location.origin).href;
  event.waitUntil(openChat(url));
});

async function openChat(url) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
  if (existing) {
    await existing.focus();
    try {
      await existing.navigate(url);
      return;
    } catch {
      // Not controlled by this worker yet: open a fresh window instead.
    }
  }
  await self.clients.openWindow(url);
}
