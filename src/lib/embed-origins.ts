/**
 * Sites allowed to show this app in an iframe, from NEXT_PUBLIC_EMBED_ORIGINS
 * (comma-separated origins), e.g.
 *   NEXT_PUBLIC_EMBED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
 *
 * Empty (the default) = not embeddable: normal SameSite=Lax cookies and no
 * iframe bridge. When set, also serve over https (SameSite=None needs Secure):
 *   npx next dev --experimental-https -p 3001
 *
 * Used by cookie-options.ts, embed.ts and (parsed again) next.config.ts.
 */
export const EMBED_ORIGINS: string[] = (process.env.NEXT_PUBLIC_EMBED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
