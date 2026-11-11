import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for Supabase email links (sign-up confirmation, magic links).
 * Handles both the PKCE `?code=` flow and the `?token_hash=&type=` flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Only allow same-site relative redirects.
  const nextParam = searchParams.get("next") ?? "/chat";
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/chat";

  const supabase = await createClient();
  let errorMessage: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    errorMessage = error?.message ?? null;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    errorMessage = error?.message ?? null;
  } else {
    errorMessage = "The confirmation link is missing or invalid.";
  }

  if (!errorMessage) {
    return NextResponse.redirect(new URL(next, origin));
  }

  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", errorMessage);
  return NextResponse.redirect(loginUrl);
}
