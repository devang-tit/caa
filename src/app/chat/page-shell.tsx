import type { ReactNode } from "react";

/** Header + scrolling body used by the Activity and Saved views. */
export function PageShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-5">
        <h1 className="font-semibold">{title}</h1>
        {description && <p className="hidden truncate text-sm text-muted sm:block">{description}</p>}
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain [--avatar-ring:var(--surface)]">
        <div className="mx-auto max-w-3xl px-3 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 border-b border-border px-4 py-3 last:border-0">
          <div className="h-8 w-8 animate-pulse rounded-full bg-hover" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/2 animate-pulse rounded bg-hover" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-hover" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyList({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mine text-accent-text">
        {icon}
      </span>
      <p className="font-semibold">{title}</p>
      <p className="max-w-xs text-sm text-muted">{body}</p>
    </div>
  );
}
