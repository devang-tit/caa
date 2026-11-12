import { createBrowserClient } from "@supabase/ssr";
import { cookieOptions } from "./cookie-options";

/**
 * Supabase client for Client Components. `createBrowserClient` returns a
 * singleton in the browser, so calling this repeatedly is cheap.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookieOptions },
  );
}
