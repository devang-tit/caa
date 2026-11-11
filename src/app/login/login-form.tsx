"use client";

import { useActionState, useState } from "react";
import { ChatIcon } from "@/components/icons";
import { authenticate, type AuthState } from "./actions";

export function LoginForm({ urlError }: { urlError?: React.ReactNode }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    authenticate,
    {},
  );

  const isSignUp = mode === "signup";

  return (
    <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-lg">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <ChatIcon className="h-6 w-6 fill-current" />
        </div>
        <h1 className="text-xl font-bold">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {isSignUp ? "Join the conversation in seconds." : "Sign in to keep chatting."}
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="mode" value={mode} />

        {isSignUp && (
          <Field label="Display name" htmlFor="username">
            <input
              id="username"
              name="username"
              type="text"
              maxLength={32}
              autoComplete="nickname"
              placeholder="e.g. alex"
              className="input"
            />
          </Field>
        )}

        <Field label="Email" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="input"
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            placeholder="••••••••"
            className="input"
          />
        </Field>

        {!state.error && !state.message && urlError}
        {state.error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-primary w-full py-2"
        >
          {pending ? "Please wait…" : isSignUp ? "Sign up" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {isSignUp ? "Already have an account?" : "New here?"}{" "}
        <button
          type="button"
          onClick={() => setMode(isSignUp ? "signin" : "signup")}
          className="font-semibold text-accent-text hover:underline"
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </button>
      </p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}
