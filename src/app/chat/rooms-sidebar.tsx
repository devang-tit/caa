"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Avatar } from "@/components/avatar";
import { ComposeIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { subscribeToChannel } from "@/lib/supabase/realtime";
import type { Room } from "@/lib/types";
import { useRoomSearch } from "./room-search";

function upsertRoom(rooms: Room[], room: Room) {
  if (rooms.some((r) => r.id === room.id)) return rooms;
  return [...rooms, room].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function RoomsSidebar({ initialRooms }: { initialRooms: Room[] }) {
  const router = useRouter();
  const { roomId } = useParams<{ roomId?: string }>();
  const { query } = useRoomSearch();
  const [rooms, setRooms] = useState(initialRooms);
  const [composerOpen, setComposerOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live room list: new rooms created by anyone appear instantly.
  useEffect(() => {
    return subscribeToChannel(createClient(), "rooms-list", { config: {} }, (channel) => {
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "rooms" },
        ({ new: row }) => setRooms((prev) => upsertRoom(prev, row as Room)),
      );
    });
  }, []);

  function closeComposer() {
    setComposerOpen(false);
    setName("");
    setError(null);
  }

  async function createRoom(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;

    setCreating(true);
    setError(null);
    const { data, error } = await createClient()
      .from("rooms")
      .insert({ name: trimmed })
      .select("id, name, created_by, created_at")
      .single<Room>();
    setCreating(false);

    if (error) {
      setError(error.code === "23505" ? "A room with that name already exists." : error.message);
      return;
    }
    closeComposer();
    setRooms((prev) => upsertRoom(prev, data));
    router.push(`/chat/${data.id}`);
  }

  const showComposer = composerOpen || rooms.length === 0;
  const needle = query.trim().toLowerCase();
  const visibleRooms = needle
    ? rooms.filter((room) => room.name.toLowerCase().includes(needle))
    : rooms;

  return (
    <aside
      className={`${roomId ? "hidden md:flex" : "flex"} w-full flex-col border-r border-border bg-pane md:w-80 md:shrink-0`}
    >
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <h1 className="text-lg font-bold">Chat</h1>
        <button
          type="button"
          onClick={() => (composerOpen ? closeComposer() : setComposerOpen(true))}
          aria-expanded={showComposer}
          aria-controls="new-room"
          aria-label="New room"
          title="New room"
          className="icon-btn"
        >
          <ComposeIcon />
        </button>
      </div>

      {showComposer && (
        <form
          id="new-room"
          onSubmit={createRoom}
          onKeyDown={(e) => {
            if (e.key === "Escape" && rooms.length > 0) closeComposer();
          }}
          className="mx-3 mb-2 space-y-2 rounded-lg border border-border bg-surface p-3 shadow-sm"
        >
          <label htmlFor="new-room-name" className="block text-xs font-semibold">
            New room
          </label>
          <input
            id="new-room-name"
            autoFocus={composerOpen}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            placeholder="Give your room a name"
            className="input"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            {rooms.length > 0 && (
              <button type="button" onClick={closeComposer} className="btn-secondary">
                Cancel
              </button>
            )}
            <button type="submit" disabled={creating || !name.trim()} className="btn-primary">
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      )}

      <nav className="flex-1 overflow-y-auto px-2 pb-3" aria-label="Rooms">
        <p className="px-2 pb-1 pt-2 text-xs font-semibold text-muted">Rooms</p>
        {rooms.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted">No rooms yet. Create the first one above.</p>
        ) : (
          visibleRooms.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted">No rooms match “{query.trim()}”.</p>
          )
        )}
        <ul className="space-y-0.5">
          {visibleRooms.map((room) => {
            const active = room.id === roomId;
            return (
              <li key={room.id}>
                <Link
                  href={`/chat/${room.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-md px-2 py-2 text-sm transition ${
                    active ? "bg-surface font-semibold shadow-sm" : "hover:bg-pane-hover"
                  }`}
                >
                  <Avatar id={room.id} name={room.name} shape="square" />
                  <span className="truncate">{room.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
