"use client";

import Link from "next/link";
import { createContext, Suspense, use, useEffect, useId, useState, type ReactNode } from "react";
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

/**
 * "bar": the desktop top-bar search, with a dropdown of matching chats and
 * messages. "field": the search field under a phone screen's large title; the
 * chat list itself shows the matches (see <MessageHits />).
 */
export function RoomSearchBox({ variant = "bar" }: { variant?: "bar" | "field" }) {
  const { query, setQuery } = useRoomSearch();
  const [open, setOpen] = useState(false);
  const resultsId = useId();
  const trimmed = query.trim();
  const dropdown = variant === "bar";

  return (
    <div role="search" className={`relative w-full ${dropdown ? "mx-auto max-w-xl" : ""}`}>
      <SearchIcon
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted ${dropdown ? "left-3 h-4 w-4" : "left-3 h-[18px] w-[18px]"}`}
      />
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
        placeholder={dropdown ? "Search chats and messages" : "Search"}
        aria-label="Search chats and messages"
        {...(dropdown && {
          role: "combobox",
          "aria-autocomplete": "list" as const,
          "aria-expanded": open && trimmed.length >= 2,
          "aria-controls": resultsId,
        })}
        enterKeyHint="search"
        className={
          dropdown
            ? "h-9 w-full rounded-full border border-transparent bg-surface pr-4 pl-9 text-sm shadow-soft outline-none transition placeholder:text-muted hover:border-border focus:border-accent-text/50 focus:ring-4 focus:ring-accent/15"
            : "h-10 w-full rounded-xl bg-hover pr-3 pl-10 text-base outline-none transition placeholder:text-muted focus:bg-surface focus:ring-2 focus:ring-accent/30"
        }
      />
      {dropdown && open && trimmed.length >= 2 && (
        <div
          id={resultsId}
          // Keep focus in the input while clicking a result.
          onMouseDown={(e) => e.preventDefault()}
          className="animate-rise-in absolute inset-x-0 top-full z-40 mt-2 max-h-[70vh] overflow-y-auto overscroll-contain rounded-2xl bg-surface py-1.5 shadow-float ring-1 ring-border [--avatar-ring:var(--surface)]"
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
  const conversations = use(useConversationsPromise());

  const meId = me?.id ?? "";
  const needle = query.toLowerCase();
  const rooms = conversations
    .map((c) => ({ ...c, title: conversationTitle(c, c.members, meId) }))
    .filter((c) => c.title.toLowerCase().includes(needle))
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
              className="mx-1.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-hover"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft text-xs font-semibold text-accent-text">
                {c.kind === "channel" ? "#" : "@"}
              </span>
              <span className="truncate">{c.title}</span>
            </Link>
          ))}
        </Section>
      )}
      <MessageHits query={query} onNavigate={onNavigate} />
    </>
  );
}

/** Messages containing `query`, newest first. Suspends: use behind <Suspense>. */
export function MessageHits({
  query,
  onNavigate,
  inline = false,
}: {
  query: string;
  onNavigate?: () => void;
  /** Inside the chat list (phones) rather than the dropdown. */
  inline?: boolean;
}) {
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
  const pad = inline ? "px-4" : "mx-1.5 rounded-lg px-2.5";

  return (
    <Section label="Messages" inline={inline}>
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
            className={`block py-2 transition hover:bg-hover active:bg-hover ${pad}`}
          >
            <span className="flex items-baseline gap-2 text-xs text-muted">
              <span className="font-semibold text-foreground">
                {people.get(hit.user_id)?.username ?? "Unknown"}
              </span>
              <span className="truncate">in {titles.get(hit.room_id) ?? "a chat"}</span>
              <time className="ml-auto shrink-0" dateTime={hit.created_at} suppressHydrationWarning>
                {new Date(hit.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
              </time>
            </span>
            <Snippet text={plainText(hit.content)} query={query} />
          </Link>
        ))
      )}
    </Section>
  );
}

function Section({
  label,
  inline = false,
  children,
}: {
  label: string;
  inline?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="py-1">
      <p
        className={`px-4 pt-1.5 pb-1 text-xs font-semibold text-muted ${inline ? "uppercase tracking-wide" : ""}`}
      >
        {label}
      </p>
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
      <mark className="rounded bg-accent/20 px-0.5 font-medium text-foreground">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </span>
  );
}
