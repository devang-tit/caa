"use client";

import { useRouter } from "next/navigation";
import { useImperativeHandle, useRef, useState, type FormEvent, type Ref } from "react";
import { Avatar } from "@/components/avatar";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  HashIcon,
  SearchIcon,
} from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { usePeople } from "@/components/session-provider";
import { createClient } from "@/lib/supabase/client";
import { ROOM_COLUMNS, type Room } from "@/lib/types";

export type NewChatHandle = { open: () => void };

/**
 * The "New chat" sheet (opened with `ref.current.open()`). Pick one person
 * for a 1:1 chat, more for a group, or switch to creating a channel.
 */
export function NewChatSheet({
  meId,
  onChannelCreated,
  ref,
}: {
  meId: string;
  onChannelCreated: (room: Room) => void;
  ref: Ref<NewChatHandle>;
}) {
  const router = useRouter();
  const people = usePeople();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"people" | "channel">("people");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [channelName, setChannelName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const others = [...people.values()]
    .filter((p) => p.id !== meId)
    .sort((a, b) => a.username.localeCompare(b.username));
  const needle = filter.trim().toLowerCase();
  const matches = needle ? others.filter((p) => p.username.toLowerCase().includes(needle)) : others;

  function open() {
    setMode("people");
    setFilter("");
    setSelected([]);
    setChannelName("");
    setError(null);
    dialogRef.current?.showModal();
  }

  useImperativeHandle(ref, () => ({ open }));

  function close() {
    dialogRef.current?.close();
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function start() {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc("start_conversation", {
      member_ids: selected,
    });
    setBusy(false);
    if (error || typeof data !== "string") {
      setError(error?.message ?? "Couldn't start the chat.");
      return;
    }
    close();
    router.push(`/chat/${data}`);
  }

  async function createChannel(e: FormEvent) {
    e.preventDefault();
    const name = channelName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    const { data, error } = await createClient()
      .from("rooms")
      .insert({ name, kind: "channel" })
      .select(ROOM_COLUMNS)
      .single<Room>();
    setBusy(false);
    if (error) {
      setError(error.code === "23505" ? "A channel with that name already exists." : error.message);
      return;
    }
    close();
    onChannelCreated(data);
    router.push(`/chat/${data.id}`);
  }

  const action =
    mode === "channel"
      ? busy
        ? "Creating…"
        : "Create channel"
      : busy
        ? "Starting…"
        : selected.length > 1
          ? `Create group (${selected.length + 1})`
          : "Start chat";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="new-chat-title"
      // A tap on the backdrop lands on the <dialog> itself.
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="sheet m-0 mt-auto h-[88dvh] max-h-none w-full max-w-none flex-col overflow-hidden rounded-t-[28px] bg-surface p-0 text-foreground shadow-float open:flex [--avatar-ring:var(--surface)] md:m-auto md:h-[min(40rem,85dvh)] md:w-[28rem] md:rounded-3xl"
    >
      <div className="grabber shrink-0" />
      <header className="flex shrink-0 items-center gap-2 px-3 pt-1 pb-2 md:px-4 md:pt-4">
        {mode === "channel" ? (
          <button
            type="button"
            onClick={() => {
              setMode("people");
              setError(null);
            }}
            aria-label="Back"
            className="icon-btn text-foreground"
          >
            <ChevronLeftIcon />
          </button>
        ) : (
          <button type="button" onClick={close} aria-label="Close" className="icon-btn text-foreground">
            <CloseIcon className="h-5 w-5" />
          </button>
        )}
        <h2 id="new-chat-title" className="flex-1 text-center text-[17px] font-semibold">
          {mode === "channel" ? "New channel" : "New chat"}
        </h2>
        <span className="w-10" />
      </header>

      {mode === "people" ? (
        <>
          <div className="shrink-0 space-y-3 px-4 pb-2">
            <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl bg-hover px-3 py-1.5 transition focus-within:bg-surface focus-within:ring-2 focus-within:ring-accent/30">
              {selected.length === 0 && <SearchIcon className="h-[18px] w-[18px] text-muted" />}
              {selected.map((id) => {
                const person = people.get(id);
                return (
                  <span
                    key={id}
                    className="animate-rise-in flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pr-1 pl-0.5 text-sm font-medium text-accent-text"
                  >
                    <Avatar id={id} name={person?.username ?? "?"} size="xs" />
                    {person?.username}
                    <button
                      type="button"
                      onClick={() => toggle(id)}
                      aria-label={`Remove ${person?.username}`}
                      className="rounded-full p-0.5 hover:bg-accent/15"
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                );
              })}
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (matches.length === 1 && !selected.includes(matches[0].id)) {
                      toggle(matches[0].id);
                      setFilter("");
                    } else {
                      void start();
                    }
                  } else if (e.key === "Backspace" && !filter && selected.length) {
                    setSelected((prev) => prev.slice(0, -1));
                  }
                }}
                placeholder={selected.length ? "Add more people" : "Search people"}
                aria-label="Find people"
                enterKeyHint="go"
                className="min-w-28 flex-1 bg-transparent py-1 text-base outline-none placeholder:text-muted sm:text-sm"
              />
            </div>

            {!needle && selected.length === 0 && (
              <button type="button" onClick={() => setMode("channel")} className="menu-row -mx-1 w-[calc(100%+0.5rem)]">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                  <HashIcon />
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">New channel</span>
                  <span className="block text-xs text-muted">Open to everyone; anyone can join</span>
                </span>
                <ChevronRightIcon className="h-4 w-4 text-muted" />
              </button>
            )}
          </div>

          <p className="shrink-0 px-5 pt-1 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
            {needle ? "Results" : "People"}
          </p>
          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2" aria-label="People">
            {matches.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted">
                {others.length === 0 ? "Nobody else has signed up yet." : "No one matches that name."}
              </li>
            )}
            {matches.map((person) => {
              const checked = selected.includes(person.id);
              return (
                <li key={person.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-hover active:bg-hover">
                    <PersonAvatar userId={person.id} name={person.username} size="lg" />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium sm:text-sm">
                      {person.username}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(person.id)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden
                      className={`flex h-6 w-6 items-center justify-center rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text ${
                        checked ? "bg-accent text-accent-foreground" : "ring-2 ring-border ring-inset"
                      }`}
                    >
                      {checked && <CheckIcon className="h-4 w-4" strokeWidth={2.5} />}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <footer className="shrink-0 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {error && <p className="mb-2 text-sm text-danger">{error}</p>}
            <button
              type="button"
              onClick={start}
              disabled={selected.length === 0 || busy}
              className="btn-primary w-full py-3 text-[15px]"
            >
              {action}
            </button>
          </footer>
        </>
      ) : (
        <form onSubmit={createChannel} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-4 pt-4">
            <div className="flex flex-col items-center gap-3 pb-2 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-[30%] bg-accent-soft text-accent-text">
                <HashIcon className="h-8 w-8" />
              </span>
              <p className="max-w-xs text-sm text-muted">
                Channels are open conversations everyone can see and join. Give it a short,
                descriptive name.
              </p>
            </div>
            <label htmlFor="new-channel-name" className="block text-sm font-semibold">
              Channel name
            </label>
            <input
              id="new-channel-name"
              autoFocus
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              maxLength={50}
              placeholder="e.g. design-team"
              enterKeyHint="done"
              className="input"
            />
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
          <footer className="shrink-0 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="submit"
              disabled={busy || !channelName.trim()}
              className="btn-primary w-full py-3 text-[15px]"
            >
              {action}
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}
