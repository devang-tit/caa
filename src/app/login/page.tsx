import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Realtime Chat" };

type SearchParams = PageProps<"/login">["searchParams"];

// The form is static (prerendered); only an error passed in the URL
// (e.g. from a failed email confirmation) streams in at request time.
export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
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
    <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
      {error}
    </p>
  );
}
