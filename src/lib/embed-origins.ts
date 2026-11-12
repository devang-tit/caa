/**
 * Sites allowed to show this app in an iframe, from NEXT_PUBLIC_EMBED_ORIGINS
 * (comma-separated origins), e.g.
 *   NEXT_PUBLIC_EMBED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
 * Each entry is reduced to its origin, so a trailing slash or path is harmless.
 *
 * Empty (the default) = not embeddable: normal cookies and no iframe bridge.
 * Locally, embedding needs https: npx next dev --experimental-https -p 3001
 *
 * Used by cookie-options.ts, embed.ts, app/layout.tsx and (parsed the same way)
 * next.config.ts.
 */
export const EMBED_ORIGINS: string[] = (process.env.NEXT_PUBLIC_EMBED_ORIGINS ?? "")
  .split(",")
  .map(toOrigin)
  .filter((o): o is string => o !== null);

function toOrigin(value: string): string | null {
  try {
    const origin = new URL(value.trim()).origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

/**
 * Marker cookie the head script in app/layout.tsx sets (Partitioned) when the
 * app is framed. Its presence tells the server a request comes from inside the
 * widget, so auth cookies get the embedded options (see cookie-options.ts).
 */
export const EMBED_COOKIE = "caa-embed";
