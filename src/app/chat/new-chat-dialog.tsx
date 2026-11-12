"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { CloseIcon, ComposeIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { usePeople } from "@/components/session-provider";
import { createClient } from "@/lib/supabase/client";

/** "New chat" button + people picker. One person → 1:1 chat; more → group. */
export function NewChatButton({ meId }: { meId: string }) {
  const router = useRouter();
  const people = usePeople();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const others = [...people.values()]
    .filter((p) => p.id !== meId)
    .sort((a, b) => a.username.localeCompare(b.username));
  const needle = filter.trim().toLowerCase();
  const matches = needle ? others.filter((p) => p.username.toLowerCase().includes(needle)) : others;

  function open() {
    setFilter("");
    setSelected([]);
    setError(null);
    dialogRef.current?.showModal();
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
    dialogRef.current?.close();
    router.push(`/chat/${data}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="New chat"
        title="New chat"
        className="icon-btn"
      >
        <ComposeIcon />
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="new-chat-title"
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/40 [--avatar-ring:var(--surface)]"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="new-chat-title" className="text-base font-bold">
            New chat
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="icon-btn"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border px-2 py-1.5 focus-within:shadow-[inset_0_-2px_0_0_var(--accent-text)]">
            <span className="text-sm text-muted">To:</span>
            {selected.map((id) => {
              const person = people.get(id);
              return (
                <span
                  key={id}
                  className="flex items-center gap-1 rounded-full bg-mine py-0.5 pl-0.5 pr-1.5 text-xs font-semibold"
                >
                  <Avatar id={id} name={person?.username ?? "?"} size="xs" />
                  {person?.username}
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    aria-label={`Remove ${person?.username}`}
                    className="rounded-full p-0.5 hover:bg-black/10"
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
            <input
              autoFocus
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
              placeholder={selected.length ? "" : "Enter a name"}
              aria-label="Find people"
              className="min-w-24 flex-1 bg-transparent py-0.5 text-base outline-none placeholder:text-muted sm:text-sm"
            />
          </div>

          <ul className="max-h-72 space-y-0.5 overflow-y-auto overscroll-contain" aria-label="People">
            {matches.length === 0 && (
              <li className="px-2 py-3 text-sm text-muted">
                {others.length === 0 ? "Nobody else has signed up yet." : "No one matches that name."}
              </li>
            )}
            {matches.map((person) => {
              const checked = selected.includes(person.id);
              return (
                <li key={person.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-hover">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(person.id)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <PersonAvatar userId={person.id} name={person.username} />
                    <span className="truncate">{person.username}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={() => dialogRef.current?.close()} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={start}
            disabled={selected.length === 0 || busy}
            className="btn-primary"
          >
            {busy ? "Starting…" : selected.length > 1 ? "Create group chat" : "Start chat"}
          </button>
        </div>
      </dialog>
    </>
  );
}
