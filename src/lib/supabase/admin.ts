import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client with the secret (service_role) key: bypasses RLS. Only for
 * trusted server code that has already checked who is calling, such as the
 * /api/push webhook. Never import this from a Client Component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
