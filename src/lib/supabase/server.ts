import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { EMBED_COOKIE } from "@/lib/embed-origins";
import type { Conversation, CurrentUser, Profile, Status } from "@/lib/types";
import { serverCookieOptions } from "./cookie-options";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Create a new one per request — never share it between requests.
 */
export async function createClient() {
  const cookieStore = await cookies();
  // Partial Prefetching can resolve cookies() while prerendering a per-session
  // shell. supabase-js reads the clock when it starts, which prerendering
  // forbids, so wait for the real request before creating the client.
  await connection();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: serverCookieOptions(cookieStore.has(EMBED_COOKIE)),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore: the proxy refreshes the session on every request.
          }
        },
      },
    },
  );
}

/**
 * The signed-in user and their profile, deduplicated per request so the
 * layout and page can both call it without extra round-trips.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, status")
    .eq("id", claims.sub)
    .maybeSingle<{ username: string; status: Status }>();

  return {
    id: claims.sub,
    username: profile?.username ?? claims.email?.split("@")[0] ?? "me",
    status: profile?.status ?? "available",
  } satisfies CurrentUser;
});

/** Everyone's profile — the directory behind avatars, mentions and the people picker. */
export const getPeople = cache(async (): Promise<Profile[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, status")
    .order("username")
    .overrideTypes<Profile[], { merge: false }>();
  return data ?? [];
});

/** Channels plus your chats, with unread counts and chat members. */
export const getConversations = cache(async (): Promise<Conversation[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_conversations");
  return (data as Conversation[] | null) ?? [];
});

/** Unread Activity items (mentions, replies, reactions) for the badge. */
export const getUnreadActivityCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
});
