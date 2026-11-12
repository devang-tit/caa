import type { CookieOptionsWithName } from "@supabase/ssr";
import { EMBED_ORIGINS } from "@/lib/embed-origins";

/**
 * Auth cookie options inside the embedding widget (a cross-site iframe).
 *
 * Browsers that block third-party cookies (Incognito, Brave, Chrome or Edge
 * with blocking on) still allow Partitioned ones: they are stored per
 * top-level site, so the chat stays signed in inside that host page and
 * nowhere else. Partitioned requires Secure, and a cross-site iframe needs
 * SameSite=None.
 *
 * Outside the widget the @supabase/ssr defaults (SameSite=Lax) apply, exactly
 * as when embedding is off.
 */
const EMBEDDED: CookieOptionsWithName = { sameSite: "none", secure: true, partitioned: true };

/** Server side: `hasEmbedMarker` = the request carries the EMBED_COOKIE marker. */
export function serverCookieOptions(hasEmbedMarker: boolean): CookieOptionsWithName | undefined {
  return EMBED_ORIGINS.length > 0 && hasEmbedMarker ? EMBEDDED : undefined;
}

/** Browser side: framed means embedded. */
export function browserCookieOptions(): CookieOptionsWithName | undefined {
  const framed = typeof window !== "undefined" && window.self !== window.top;
  return EMBED_ORIGINS.length > 0 && framed ? EMBEDDED : undefined;
}
