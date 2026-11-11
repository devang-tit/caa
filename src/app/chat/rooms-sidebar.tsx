"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Avatar } from "@/components/avatar";
import { createClient } from "@/lib/supabase/client";
import { subscribeToChannel } from "@/lib/supabase/realtime";
import type { CurrentUser, Room } from "@/lib/types";

function upsertRoom(rooms: Room[], room: Room) {
  if (rooms.some((r) => r.id === room.id)) return rooms;
  return [...rooms, room].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function RoomsSidebar({
  initialRooms,
  me,
}: {
  initialRooms: Room[];
  me: CurrentUser;
}) {
  const router = useRouter();
  const { roomId } = useParams<{ roomId?: string }>();
  const [rooms, setRooms] = useState(initialRooms);
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
    setName("");
    setRooms((prev) => upsertRoom(prev, data));
    router.push(`/chat/${data.id}`);
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside
      className={`${roomId ? "hidden md:flex" : "flex"} w-full flex-col border-r border-border bg-surface md:w-72 md:shrink-0`}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <span className="text-lg">💬</span>
        <h1 className="font-semibold">Realtime Chat</h1>
      </div>

      <nav className="flex-1 overflow-y-auto p-2" aria-label="Rooms">
        <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted">
          Rooms
        </p>
        {rooms.length === 0 && (
          <p className="px-2 py-3 text-sm text-muted">No rooms yet. Create the first one below.</p>
        )}
        <ul className="space-y-0.5">
          {rooms.map((room) => {
            const active = room.id === roomId;
            return (
              <li key={room.id}>
                <Link
                  href={`/chat/${room.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 truncate rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? "bg-accent/10 font-medium text-accent"
                      : "text-foreground hover:bg-hover"
                  }`}
                >
                  <span className="text-muted">#</span>
                  <span className="truncate">{room.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form onSubmit={createRoom} className="space-y-2 border-t border-border p-3">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            placeholder="New room name"
            aria-label="New room name"
            className="input py-1.5"
          />
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="shrink-0 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </form>

      <div className="flex items-center gap-3 border-t border-border px-4 py-3">
        <Avatar id={me.id} name={me.username} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{me.username}</p>
          <p className="text-xs text-muted">Signed in</p>
        </div>
        <button
          onClick={signOut}
          className="rounded-md px-2 py-1 text-xs text-muted transition hover:bg-hover hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
