import type { MetadataRoute } from "next";

// Lets phones install the site ("Add to Home Screen"). iPhone/iPad only allow
// web push for installed sites.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Realtime Chat",
    short_name: "Chat",
    description: "A realtime chat app built with Next.js and Supabase",
    start_url: "/chat",
    scope: "/",
    display: "standalone",
    background_color: "#f5f5f5",
    theme_color: "#5b5fc7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
