import type { CookieOptionsWithName } from "@supabase/ssr";
import { EMBED_ORIGINS } from "@/lib/embed-origins";

/**
 * Auth cookie options shared by the browser, server and proxy clients.
 *
 * When embedding is on (see embed-origins.ts), the chat must stay signed in
 * inside an iframe on another site. Browsers only send SameSite=None cookies
 * to a cross-site iframe, and SameSite=None requires Secure. next.config.ts
 * then limits which sites may frame the app.
 *
 * Off by default: the @supabase/ssr defaults (SameSite=Lax) apply.
 */
export const cookieOptions: CookieOptionsWithName | undefined =
  EMBED_ORIGINS.length > 0 ? { sameSite: "none", secure: true } : undefined;
