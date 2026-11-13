"use client";

import { Suspense, useState, type ReactNode, type UIEvent } from "react";
import { UserMenuButton, UserMenuButtonFallback } from "./user-menu";

/**
 * A scrolling screen with a large title (phones): the big title scrolls away
 * and a compact title fades into a frosted bar pinned to the top. On desktop
 * it's a plain header bar with the title.
 */
export function LargeTitleScreen({
  title,
  description,
  actions,
  children,
  className = "",
  onScroll,
}: {
  title: string;
  description?: string;
  /** Buttons on the right of the bar. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  onScroll?: (e: UIEvent<HTMLDivElement>) => void;
}) {
  const [scrolled, setScrolled] = useState(false);

  return (
    <div
      onScroll={(e) => {
        const next = e.currentTarget.scrollTop > 36;
        if (next !== scrolled) setScrolled(next);
        onScroll?.(e);
      }}
      className={`relative min-h-0 flex-1 overflow-y-auto overscroll-contain ${className}`}
    >
      <div
        data-scrolled={scrolled}
        className="sticky top-0 z-20 flex h-14 items-center gap-2 px-3 transition-[background-color,box-shadow] duration-200 data-[scrolled=true]:glass data-[scrolled=true]:shadow-[0_1px_0_var(--border)] md:h-16 md:px-5"
      >
        <div className="flex w-12 md:hidden">
          <Suspense fallback={<UserMenuButtonFallback />}>
            <UserMenuButton />
          </Suspense>
        </div>
        <h1
          className={`min-w-0 flex-1 truncate text-center text-[17px] font-semibold transition-opacity duration-200 md:flex-none md:text-left md:text-xl md:font-bold md:tracking-tight md:opacity-100 ${
            scrolled ? "opacity-100" : "opacity-0"
          }`}
        >
          {title}
        </h1>
        {description && (
          <p className="hidden min-w-0 truncate text-sm text-muted lg:block">{description}</p>
        )}
        <div className="flex min-w-12 items-center justify-end gap-1 md:ml-auto">{actions}</div>
      </div>

      <div className="px-4 pt-0.5 pb-3 md:hidden">
        {/* The <h1> above holds the title for screen readers. */}
        <p aria-hidden className="text-[34px] leading-10 font-bold tracking-[-0.02em]">
          {title}
        </p>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>

      {children}
    </div>
  );
}
