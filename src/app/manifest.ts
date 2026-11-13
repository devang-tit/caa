import type { MetadataRoute } from "next";

// Makes the site installable ("Install app" / "Add to Home Screen"): it then
// opens full screen like a native app. iPhone/iPad only allow web push for
// installed sites. The service worker is public/sw.js.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/chat",
    name: "Realtime Chat",
    short_name: "Chat",
    description: "A realtime chat app built with Next.js and Supabase",
    start_url: "/chat",
    scope: "/",
    display: "standalone",
    categories: ["social", "communication"],
    background_color: "#ffffff",
    theme_color: "#5457e6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the app icon to jump straight to these.
    shortcuts: [
      { name: "Activity", url: "/chat/activity", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Saved", url: "/chat/saved", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
