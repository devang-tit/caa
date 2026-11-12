import type { NextConfig } from "next";

// Sites allowed to frame the app; empty = no header (see src/lib/embed-origins.ts).
const embedOrigins = (process.env.NEXT_PUBLIC_EMBED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  async headers() {
    if (embedOrigins.length === 0) return [];
    // Embedding makes the auth cookies SameSite=None, so a signed-in session
    // would load in any site's iframe. Allow only the listed sites.
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors 'self' ${embedOrigins.join(" ")}`,
          },
        ],
      },
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
