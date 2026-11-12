import type { NextConfig } from "next";

// Sites allowed to frame the app; empty = no header. Parsed like
// src/lib/embed-origins.ts: each entry reduced to its origin.
const embedOrigins = (process.env.NEXT_PUBLIC_EMBED_ORIGINS ?? "")
  .split(",")
  .map((o) => {
    try {
      return new URL(o.trim()).origin;
    } catch {
      return "null";
    }
  })
  .filter((o) => o !== "null");

const nextConfig: NextConfig = {
  async headers() {
    return [
      // The push service worker: always fetch the latest version.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      // In-frame auth cookies are SameSite=None (Partitioned), so a signed-in
      // session would load in a framing site. Allow only the listed sites.
      ...(embedOrigins.length > 0
        ? [
            {
              source: "/:path*",
              headers: [
                {
                  key: "Content-Security-Policy",
                  value: `frame-ancestors 'self' ${embedOrigins.join(" ")}`,
                },
              ],
            },
          ]
        : []),
    ];
  },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
