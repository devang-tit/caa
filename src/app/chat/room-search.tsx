"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { SearchIcon } from "@/components/icons";

type RoomSearch = { query: string; setQuery: (query: string) => void };

const RoomSearchContext = createContext<RoomSearch | null>(null);

/** Shares the top-bar search text with the rooms list. */
export function RoomSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  return <RoomSearchContext value={{ query, setQuery }}>{children}</RoomSearchContext>;
}

export function useRoomSearch() {
  const context = use(RoomSearchContext);
  if (!context) throw new Error("useRoomSearch must be used inside <RoomSearchProvider>");
  return context;
}

export function RoomSearchBox() {
  const { query, setQuery } = useRoomSearch();
  return (
    <div role="search" className="relative mx-auto w-full max-w-xl">
      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQuery("");
        }}
        placeholder="Search rooms"
        aria-label="Search rooms"
        className="h-8 w-full rounded-md border border-transparent bg-surface pl-8 pr-3 text-sm outline-none transition placeholder:text-muted hover:border-border focus:border-border focus:shadow-[inset_0_-2px_0_0_var(--accent-text)]"
      />
    </div>
  );
}
