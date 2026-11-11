"use client";

import Link from "next/link";
import { useRef } from "react";
import { Avatar } from "@/components/avatar";
import { ChevronLeftIcon, PeopleIcon, PinIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { usePresence } from "@/components/session-provider";
import { plainText } from "@/lib/rich-text";
import { STATUS_LABELS, type Member, type Message, type Room } from "@/lib/types";

export type ConnectionStatus = "connecting" | "live" | "offline";

export function RoomHeader({
  room,
  title,
  meId,
  members,
  here,
  status,
  pinned,
  nameOf,
  onJump,
  onUnpin,
}: {
  room: Room;
  title: string;
  meId: string;
  /** Members of a direct/group chat (empty for channels). */
  members: Member[];
  /** People with this conversation open right now. */
  here: Member[];
  status: ConnectionStatus;
  pinned: Message[];
  nameOf: (userId: string) => string;
  onJump: (id: string) => void;
  onUnpin: (message: Message) => void;
}) {
  const pinnedRef = useRef<HTMLDivElement>(null);
  const other = room.kind === "direct" ? members.find((m) => m.id !== meId) : undefined;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 [--avatar-ring:var(--surface)] sm:px-5">
      <Link href="/chat" aria-label="Back to chats" className="icon-btn -ml-1 md:hidden">
        <ChevronLeftIcon />
      </Link>

      {room.kind === "channel" ? (
        <Avatar id={room.id} name={title} shape="square" />
      ) : other ? (
        <PersonAvatar userId={other.id} name={other.username} />
      ) : (
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mine text-accent-text">
          <PeopleIcon className="h-4 w-4" />
        </span>
      )}

      <div className="min-w-0">
        <h2 className="truncate font-semibold leading-tight">{title}</h2>
        {other ? (
          <OtherStatus userId={other.id} />
        ) : room.kind === "group" ? (
          <p className="text-xs text-muted">{members.length} people</p>
        ) : null}
      </div>

      <nav aria-label="Conversation views" className="hidden self-stretch sm:flex">
        <span
          aria-current="page"
          className="relative flex items-center px-3 text-sm font-semibold after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-accent-text"
        >
          Chat
        </span>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {status !== "live" && (
          <span
            className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
              status === "connecting"
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "bg-danger/10 text-danger"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === "connecting" ? "animate-pulse bg-amber-500" : "bg-danger"
              }`}
            />
            <span className="hidden sm:inline">
              {status === "connecting" ? "Connecting…" : "Reconnecting…"}
            </span>
          </span>
        )}

        {pinned.length > 0 && (
          <>
            <button
              type="button"
              popoverTarget="pinned-messages"
              aria-label={`${pinned.length} pinned messages`}
              title="Pinned messages"
              className="flex h-8 items-center gap-1 rounded-md px-2 text-sm text-muted transition hover:bg-hover hover:text-foreground"
            >
              <PinIcon className="h-4 w-4" />
              {pinned.length}
            </button>
            <div
              ref={pinnedRef}
              id="pinned-messages"
              popover="auto"
              className="fixed inset-auto right-3 top-28 m-0 max-h-[60vh] w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-border bg-surface p-0 text-foreground shadow-xl"
            >
              <p className="border-b border-border px-4 py-3 text-sm font-semibold">Pinned messages</p>
              <ul className="p-1">
                {pinned.map((message) => (
                  <li key={message.id} className="group/pin flex items-start gap-2 rounded-md hover:bg-hover">
                    <button
                      type="button"
                      onClick={() => {
                        pinnedRef.current?.hidePopover();
                        onJump(message.id);
                      }}
                      className="min-w-0 flex-1 px-3 py-2 text-left"
                    >
                      <span className="block text-xs font-semibold">{nameOf(message.user_id)}</span>
                      <span className="line-clamp-2 text-sm text-muted">
                        {plainText(message.content) ||
                          (message.attachments[0] ? `📎 ${message.attachments[0].name}` : "")}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onUnpin(message)}
                      className="m-1.5 shrink-0 rounded px-2 py-1 text-xs text-muted hover:bg-surface hover:text-foreground"
                    >
                      Unpin
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {room.kind === "channel" ? (
          <div className="flex items-center gap-2" title={here.map((u) => u.username).join(", ")}>
            <div className="hidden -space-x-1.5 sm:flex">
              {here.slice(0, 4).map((u) => (
                <Avatar key={u.id} id={u.id} name={u.username} size="sm" className="ring-2 ring-surface" />
              ))}
            </div>
            <span className="flex items-center gap-1 text-sm text-muted">
              <PeopleIcon className="h-4 w-4" />
              <span className="sr-only">Here now:</span>
              {here.length}
            </span>
          </div>
        ) : room.kind === "group" ? (
          <span
            className="flex items-center gap-1 text-sm text-muted"
            title={members.map((m) => m.username).join(", ")}
          >
            <PeopleIcon className="h-4 w-4" />
            <span className="sr-only">Members:</span>
            {members.length}
          </span>
        ) : null}
      </div>
    </header>
  );
}

function OtherStatus({ userId }: { userId: string }) {
  const presence = usePresence(userId);
  return <p className="text-xs text-muted">{STATUS_LABELS[presence]}</p>;
}
