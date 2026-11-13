"use client";

import Link from "next/link";
import { useRef } from "react";
import { Avatar, GroupAvatar } from "@/components/avatar";
import { ChevronLeftIcon, PeopleIcon, PinIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { usePresence } from "@/components/session-provider";
import { plainText } from "@/lib/rich-text";
import { STATUS_LABELS, type Member, type Message, type Room } from "@/lib/types";

export type ConnectionStatus = "connecting" | "live" | "offline";

/**
 * Frosted header floating over the messages: back (phones), who it's with,
 * live status or "typing…", and a pinned-message bar under it when there
 * are pins. Its height is HEADER_HEIGHT (+ PINNED_BAR_HEIGHT).
 */
export function RoomHeader({
  room,
  title,
  meId,
  members,
  here,
  status,
  typing,
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
  /** Someone is typing (shown instead of the subtitle). */
  typing: string;
  pinned: Message[];
  nameOf: (userId: string) => string;
  onJump: (id: string) => void;
  onUnpin: (message: Message) => void;
}) {
  const pinnedRef = useRef<HTMLDivElement>(null);
  const other = room.kind === "direct" ? members.find((m) => m.id !== meId) : undefined;
  const latestPin = pinned[0];

  return (
    <div className="glass absolute inset-x-0 top-0 z-20 shadow-[0_1px_0_var(--border)] [--avatar-ring:var(--surface)]">
      <header className="flex h-16 items-center gap-2.5 px-2 sm:px-4">
        <Link
          href="/chat"
          aria-label="Back to chats"
          className="icon-btn -mr-1 text-accent-text md:hidden"
        >
          <ChevronLeftIcon className="h-7 w-7" strokeWidth={2} />
        </Link>

        {room.kind === "channel" ? (
          <Avatar id={room.id} name={title} shape="square" size="lg" />
        ) : other ? (
          <PersonAvatar userId={other.id} name={other.username} size="lg" />
        ) : (
          <GroupAvatar size="lg" />
        )}

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] leading-tight font-semibold">
            {room.kind === "channel" && <span className="mr-0.5 text-muted">#</span>}
            {title}
          </h2>
          <p className="truncate text-xs leading-tight text-muted" aria-live="polite">
            {typing ? (
              <span className="font-medium text-accent-text">{typing}</span>
            ) : other ? (
              <OtherStatus userId={other.id} />
            ) : room.kind === "group" ? (
              `${members.length} members`
            ) : here.length > 0 ? (
              `${here.length} here now`
            ) : (
              "Channel"
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {status !== "live" && (
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                status === "connecting" ? "bg-warning/15 text-warning" : "bg-danger/10 text-danger"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  status === "connecting" ? "animate-pulse bg-warning" : "bg-danger"
                }`}
              />
              <span className="hidden sm:inline">
                {status === "connecting" ? "Connecting…" : "Reconnecting…"}
              </span>
            </span>
          )}

          {room.kind === "channel" ? (
            <div className="hidden items-center gap-2 sm:flex" title={here.map((u) => u.username).join(", ")}>
              <div className="flex -space-x-2">
                {here.slice(0, 4).map((u) => (
                  <Avatar key={u.id} id={u.id} name={u.username} size="sm" className="ring-2 ring-surface" />
                ))}
              </div>
              <span className="sr-only">Here now: {here.length}</span>
            </div>
          ) : room.kind === "group" ? (
            <span
              className="hidden items-center gap-1 rounded-full bg-hover px-2.5 py-1 text-xs font-medium text-muted sm:flex"
              title={members.map((m) => m.username).join(", ")}
            >
              <PeopleIcon className="h-4 w-4" />
              {members.length}
            </span>
          ) : null}
        </div>
      </header>

      {latestPin && (
        <div className="flex h-11 items-center gap-1 border-t border-border/70 pr-2 pl-3 sm:pl-5">
          <button
            type="button"
            onClick={() => onJump(latestPin.id)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1 text-left"
          >
            <span className="h-7 w-[3px] shrink-0 rounded-full bg-accent" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] leading-tight font-semibold text-accent-text">
                Pinned message
                {pinned.length > 1 && <span className="font-normal text-muted"> · {pinned.length} pinned</span>}
              </span>
              <span className="block truncate text-[13px] leading-tight">
                {nameOf(latestPin.user_id)}: {pinPreview(latestPin)}
              </span>
            </span>
          </button>
          <button
            type="button"
            popoverTarget="pinned-messages"
            aria-label={`All ${pinned.length} pinned messages`}
            title="All pinned messages"
            className="icon-btn h-8 w-8"
          >
            <PinIcon className="h-[18px] w-[18px]" />
          </button>

          <div
            ref={pinnedRef}
            id="pinned-messages"
            popover="auto"
            aria-label="Pinned messages"
            className="sheet fixed inset-x-0 top-auto bottom-0 m-0 max-h-[75dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-[28px] border-0 bg-surface p-0 pb-[max(1rem,env(safe-area-inset-bottom))] text-foreground shadow-float md:inset-auto md:top-42 md:right-4 md:max-h-[60vh] md:w-96 md:rounded-2xl md:pb-2 md:ring-1 md:ring-border"
          >
            <div className="grabber" />
            <p className="px-5 pt-3 pb-2 text-[17px] font-semibold md:px-4 md:text-sm">
              Pinned messages
            </p>
            <ul className="px-2">
              {pinned.map((message) => (
                <li key={message.id} className="flex items-center gap-1 rounded-xl hover:bg-hover">
                  <button
                    type="button"
                    onClick={() => {
                      pinnedRef.current?.hidePopover();
                      onJump(message.id);
                    }}
                    className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5 text-left"
                  >
                    <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold">{nameOf(message.user_id)}</span>
                      <span className="line-clamp-2 text-sm text-muted">{pinPreview(message)}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onUnpin(message)}
                    className="m-1.5 shrink-0 rounded-full bg-hover px-3 py-1 text-xs font-semibold text-muted hover:text-foreground"
                  >
                    Unpin
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/** Space the header covers at the top of the message list, in px. */
export const HEADER_HEIGHT = 64;
export const PINNED_BAR_HEIGHT = 44;

function pinPreview(message: Message) {
  return (
    plainText(message.content) || (message.attachments[0] ? `📎 ${message.attachments[0].name}` : "")
  );
}

function OtherStatus({ userId }: { userId: string }) {
  const presence = usePresence(userId);
  return (
    <span className={presence === "available" ? "text-success" : undefined}>
      {presence === "available" ? "Online" : STATUS_LABELS[presence]}
    </span>
  );
}
