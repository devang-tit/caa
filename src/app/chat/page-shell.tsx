import type { ReactNode } from "react";
import { LargeTitleScreen } from "./large-title";

/** Large-title screen used by the Activity and Saved views. */
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
    <div className="flex min-h-0 flex-1 flex-col bg-pane md:bg-background">
      <LargeTitleScreen title={title} description={description} className="[--avatar-ring:var(--pane)] md:[--avatar-ring:var(--surface)]">
        <div className="mx-auto max-w-3xl pb-32 md:px-6 md:pt-2 md:pb-8">{children}</div>
      </LargeTitleScreen>
    </div>
  );
}

/**
 * The list container for those views: edge-to-edge rows with inset dividers
 * on phones, a rounded card on desktop.
 */
export const LIST_CLASS =
  "md:divide-y md:divide-border/70 md:overflow-hidden md:rounded-2xl md:bg-surface md:shadow-soft md:ring-1 md:ring-border";

/** Inset hairline under a row's text on phones (put `group/row` on the <li>). */
export const ROW_DIVIDER = "border-border/70 max-md:border-b max-md:group-last/row:border-0";

export function ListSkeleton() {
  return (
    <div className={LIST_CLASS}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 px-4 py-3.5">
          <div className="h-10 w-10 animate-pulse rounded-full bg-hover" />
          <div className="flex-1 space-y-2 pt-1.5">
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
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <span className="mb-1 flex h-16 w-16 items-center justify-center rounded-3xl bg-accent-soft text-accent-text">
        {icon}
      </span>
      <p className="text-[17px] font-semibold">{title}</p>
      <p className="max-w-xs text-sm text-muted">{body}</p>
    </div>
  );
}
