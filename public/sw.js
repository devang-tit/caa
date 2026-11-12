// Service worker: makes the site an installable app (PWA) and shows phone
// notifications (Web Push, payloads from app/api/push).
//
// Registered on every visit to the site itself (src/lib/pwa.ts), never inside
// an embedding widget.
//
// Caching is deliberately narrow:
// - /_next/static/* (hashed build files, never change): cache first, so the
//   app starts instantly and works on a bad connection.
// - Pages: always from the network (they carry your messages and session);
//   only when offline, a small "You're offline" page instead.
// - Supabase, /api and everything else: untouched.

const VERSION = "v2";
const STATIC_CACHE = `static-${VERSION}`;
const SHELL_CACHE = `shell-${VERSION}`;
const SHELL = ["/offline.html", "/icon-192.png", "/badge-72.png"];
const MAX_STATIC_ENTRIES = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, SHELL_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
      // Start page requests while this worker boots, instead of after.
      await self.registration.navigationPreload?.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(pageOrOffline(event));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    void trim(cache);
  }
  return response;
}

async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.length - MAX_STATIC_ENTRIES;
  if (extra > 0) await Promise.all(keys.slice(0, extra).map((key) => cache.delete(key)));
}

async function pageOrOffline(event) {
  try {
    return (await event.preloadResponse) || (await fetch(event.request));
  } catch {
    return (await caches.match("/offline.html")) || Response.error();
  }
}

// ── Phone notifications ──────────────────────────────────────────────────────

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
