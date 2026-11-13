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
    <div className="w-full max-w-sm sm:rounded-[28px] sm:bg-surface sm:p-8 sm:shadow-float sm:ring-1 sm:ring-border">
      <div className="mb-7 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] bg-linear-to-br from-accent to-accent-hover text-accent-foreground shadow-float">
          <ChatIcon className="h-8 w-8 fill-current/20" strokeWidth={1.8} />
        </div>
        <h1 className="text-[26px] leading-tight font-bold tracking-tight">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1.5 text-[15px] text-muted">
          {isSignUp ? "Join the conversation in seconds." : "Sign in to keep chatting."}
        </p>
      </div>

      <div role="tablist" aria-label="Account" className="mb-6 grid grid-cols-2 rounded-full bg-hover p-1">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-full py-2 text-sm font-semibold transition ${
              mode === m ? "bg-surface text-foreground shadow-soft" : "text-muted hover:text-foreground"
            }`}
          >
            {m === "signin" ? "Sign in" : "Sign up"}
          </button>
        ))}
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
              className="input h-12"
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
            className="input h-12"
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
            className="input h-12"
          />
        </Field>

        {!state.error && !state.message && urlError}
        {state.error && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="rounded-xl bg-success/10 px-3.5 py-2.5 text-sm text-success">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-primary w-full py-3 text-[15px]"
        >
          {pending ? "Please wait…" : isSignUp ? "Sign up" : "Sign in"}
        </button>
      </form>
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
      <label htmlFor={htmlFor} className="block px-1 text-[13px] font-semibold text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
