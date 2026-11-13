import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Realtime Chat" };

type SearchParams = PageProps<"/login">["searchParams"];

// The form is static (prerendered); only an error passed in the URL
// (e.g. from a failed email confirmation) streams in at request time.
export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-pane bg-[radial-gradient(60rem_30rem_at_50%_-10%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent)] px-6 pt-[max(4rem,calc(env(safe-area-inset-top)+2.5rem))] pb-10 sm:items-center sm:bg-background sm:pt-12">
      <LoginForm
        urlError={
          <Suspense fallback={null}>
            <UrlError searchParams={props.searchParams} />
          </Suspense>
        }
      />
    </main>
  );
}

async function UrlError({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;
  if (typeof error !== "string" || !error) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
      {error}
    </p>
  );
}
