"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = {
  error?: string;
  message?: string;
};

export async function authenticate(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const mode = formData.get("mode") === "signup" ? "signup" : "signin";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const username = String(formData.get("username") ?? "").trim();

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();

  if (mode === "signup") {
    if (password.length < 6) {
      return { error: "Password must be at least 6 characters." };
    }
    if (username.length > 32) {
      return { error: "Display name must be 32 characters or fewer." };
    }

    const origin = (await headers()).get("origin") ?? "";
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: username || email.split("@")[0] },
        emailRedirectTo: `${origin}/auth/confirm?next=/chat`,
      },
    });

    if (error) return { error: error.message };

    // Email confirmation is on: no session until the link is clicked.
    if (!data.session) {
      return {
        message: "Check your inbox and click the confirmation link to finish signing up.",
      };
    }
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/chat");
}
