"use client";

import Link from "next/link";
import { createContext, Suspense, use, useEffect, useState, type ReactNode } from "react";
import { SearchIcon } from "@/components/icons";
import { useConversationsPromise, useMe, usePeople } from "@/components/session-provider";
import { plainText } from "@/lib/rich-text";
import { createClient } from "@/lib/supabase/client";
import { conversationTitle, type Message } from "@/lib/types";

type RoomSearch = { query: string; setQuery: (query: string) => void };

const RoomSearchContext = createContext<RoomSearch | null>(null);

/** Shares the top-bar search text with the conversations list. */
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
  const [open, setOpen] = useState(false);
  const trimmed = query.trim();

  return (
    <div role="search" className="relative mx-auto w-full max-w-xl">
      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery("");
            setOpen(false);
          }
        }}
        placeholder="Search chats and messages"
        aria-label="Search chats and messages"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && trimmed.length >= 2}
        aria-controls="search-results"
        className="h-8 w-full rounded-md border border-transparent bg-surface pl-8 pr-3 text-sm outline-none transition placeholder:text-muted hover:border-border focus:border-border focus:shadow-[inset_0_-2px_0_0_var(--accent-text)]"
      />
      {open && trimmed.length >= 2 && (
        <div
          id="search-results"
          // Keep focus in the input while clicking a result.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 top-full z-40 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-xl [--avatar-ring:var(--surface)]"
        >
          <Suspense fallback={<p className="px-4 py-3 text-sm text-muted">Searching…</p>}>
            <SearchResults query={trimmed} onNavigate={() => setOpen(false)} />
          </Suspense>
        </div>
      )}
    </div>
  );
}

type Hit = Pick<Message, "id" | "room_id" | "user_id" | "content" | "created_at">;

function SearchResults({ query, onNavigate }: { query: string; onNavigate: () => void }) {
  const me = useMe();
  const people = usePeople();
  const conversations = use(useConversationsPromise());
  const [found, setFound] = useState<{ query: string; hits: Hit[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const { data } = await createClient()
        .from("messages")
        .select("id, room_id, user_id, content, created_at")
        .ilike("content", pattern)
        .order("created_at", { ascending: false })
        .limit(8)
        .overrideTypes<Hit[], { merge: false }>();
      if (!cancelled) setFound({ query, hits: data ?? [] });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const meId = me?.id ?? "";
  const titles = new Map(conversations.map((c) => [c.id, conversationTitle(c, c.members, meId)]));
  const needle = query.toLowerCase();
  const rooms = conversations
    .filter((c) => (titles.get(c.id) ?? "").toLowerCase().includes(needle))
    .slice(0, 5);

  return (
    <>
      {rooms.length > 0 && (
        <Section label="Chats and channels">
          {rooms.map((c) => (
            <Link
              key={c.id}
              href={`/chat/${c.id}`}
              onClick={onNavigate}
              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-hover"
            >
              <span className="text-muted">{c.kind === "channel" ? "#" : "@"}</span>
              <span className="truncate">{titles.get(c.id)}</span>
            </Link>
          ))}
        </Section>
      )}

      <Section label="Messages">
        {found?.query !== query ? (
          <p className="px-4 py-2 text-sm text-muted">Searching…</p>
        ) : found.hits.length === 0 ? (
          <p className="px-4 py-2 text-sm text-muted">No messages match “{query}”.</p>
        ) : (
          found.hits.map((hit) => (
            <Link
              key={hit.id}
              href={`/chat/${hit.room_id}?m=${hit.id}`}
              onClick={onNavigate}
              className="block px-4 py-2 hover:bg-hover"
            >
              <span className="flex items-baseline gap-2 text-xs text-muted">
                <span className="font-semibold text-foreground">
                  {people.get(hit.user_id)?.username ?? "Unknown"}
                </span>
                <span className="truncate">in {titles.get(hit.room_id) ?? "a chat"}</span>
                <time className="ml-auto shrink-0" dateTime={hit.created_at}>
                  {new Date(hit.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                </time>
              </span>
              <Snippet text={plainText(hit.content)} query={query} />
            </Link>
          ))
        )}
      </Section>
    </>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-4 pb-1 pt-1.5 text-xs font-semibold text-muted">{label}</p>
      {children}
    </div>
  );
}

function Snippet({ text, query }: { text: string; query: string }) {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return <span className="line-clamp-1 text-sm">{text}</span>;
  const start = Math.max(0, index - 30);
  return (
    <span className="line-clamp-1 text-sm">
      {start > 0 && "…"}
      {text.slice(start, index)}
      <mark className="rounded bg-accent/20 px-0.5 text-foreground">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </span>
  );
}
