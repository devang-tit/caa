"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BookmarkIcon, CopyIcon, EditIcon, PinIcon, ReplyIcon, TrashIcon } from "@/components/icons";
import { QUICK_REACTIONS } from "@/lib/emoji";
import { plainText } from "@/lib/rich-text";
import type { ChatMessage } from "@/lib/types";
import type { MenuMode } from "./message-item";

export type MenuState = { message: ChatMessage; anchor: DOMRect; mode: MenuMode };

const WIDTH = 220;

/**
 * A message's actions: a dropdown next to the "…" button (or the pointer, on
 * right-click), or a bottom sheet with quick reactions after a long-press.
 */
export function MessageMenu({
  state,
  mine,
  saved,
  authorName,
  onClose,
  onReact,
  onReply,
  onTogglePin,
  onToggleSave,
  onCopy,
  onEdit,
  onDelete,
}: {
  state: MenuState;
  mine: boolean;
  saved: boolean;
  authorName: string;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onTogglePin: () => void;
  onToggleSave: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const sheet = state.mode === "sheet";

  // Measure after render so the menu can flip above the button near the bottom.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!sheet) {
      const { anchor } = state;
      const height = el.offsetHeight;
      const below = anchor.bottom + 4;
      const top = below + height > window.innerHeight - 8 ? Math.max(8, anchor.top - height - 4) : below;
      const left = Math.min(Math.max(8, anchor.right - WIDTH), window.innerWidth - WIDTH - 8);
      setPosition({ top, left });
    }
    el.querySelector<HTMLButtonElement>(sheet ? "[role=menuitem]" : "button")?.focus({ preventScroll: true });
  }, [state, sheet]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    if (sheet) return () => document.removeEventListener("keydown", onKey);

    // The dropdown closes on any outside press. (The sheet has a backdrop.)
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    // Only a width change moves the anchor: on phones the page height also
    // changes when the keyboard opens or closes, which shouldn't close it.
    const width = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth !== width) onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onResize);
    };
  }, [onClose, sheet]);

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  const items = (
    <>
      <Item sheet={sheet} icon={<ReplyIcon />} onClick={run(onReply)}>
        Reply
      </Item>
      {state.message.content.trim() && (
        <Item sheet={sheet} icon={<CopyIcon />} onClick={run(onCopy)}>
          Copy text
        </Item>
      )}
      <Item sheet={sheet} icon={<PinIcon />} onClick={run(onTogglePin)}>
        {state.message.pinned_at ? "Unpin" : "Pin"}
      </Item>
      <Item
        sheet={sheet}
        icon={<BookmarkIcon className={saved ? "fill-current" : ""} />}
        onClick={run(onToggleSave)}
      >
        {saved ? "Remove from saved" : "Save"}
      </Item>
      {mine && (
        <>
          {!sheet && <div className="mx-2 my-1 h-px bg-border" />}
          <Item sheet={sheet} icon={<EditIcon />} onClick={run(onEdit)}>
            Edit
          </Item>
          <Item sheet={sheet} icon={<TrashIcon />} onClick={run(onDelete)} danger>
            Delete
          </Item>
        </>
      )}
    </>
  );

  const arrowKeys = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const list = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
  };

  if (sheet) {
    const preview =
      plainText(state.message.content) ||
      (state.message.attachments[0] ? `📎 ${state.message.attachments[0].name}` : "");
    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-end">
        <div
          aria-hidden
          onClick={onClose}
          className="animate-fade-in absolute inset-0 bg-[rgb(8_9_14/0.42)] backdrop-blur-[2px]"
        />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label="Message actions"
          onKeyDown={arrowKeys}
          className="animate-sheet-up relative space-y-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <div className="rounded-[22px] bg-surface p-3 shadow-float">
            <p className="line-clamp-2 px-1 text-sm text-muted">
              <span className="font-semibold text-foreground">{mine ? "You" : authorName}: </span>
              {preview}
            </p>
            <div role="group" aria-label="React" className="mt-3 flex justify-between gap-1">
              {QUICK_REACTIONS.map((emoji, i) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={run(() => onReact(emoji))}
                  aria-label={`React with ${emoji}`}
                  style={{ animationDelay: `${i * 30}ms` }}
                  className="animate-rise-in flex aspect-square max-w-12 min-w-0 flex-1 items-center justify-center rounded-full bg-hover text-2xl leading-none transition active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <div role="menu" aria-label="Message options" className="overflow-hidden rounded-[22px] bg-surface shadow-float">
            {items}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-[22px] bg-surface py-3.5 text-[17px] font-semibold text-accent-text shadow-float active:bg-hover"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Message options"
      style={{ top: position?.top ?? -9999, left: position?.left ?? -9999, width: WIDTH }}
      onKeyDown={arrowKeys}
      className="fixed z-50 rounded-2xl bg-surface p-1.5 text-foreground shadow-float ring-1 ring-border"
    >
      {items}
    </div>
  );
}

function Item({
  icon,
  children,
  onClick,
  sheet,
  danger = false,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  sheet: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={
        sheet
          ? `flex w-full items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5 text-left text-[17px] outline-none last:border-0 focus-visible:bg-hover active:bg-hover ${
              danger ? "text-danger" : ""
            }`
          : `flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm outline-none transition hover:bg-hover focus-visible:bg-hover ${
              danger ? "text-danger" : ""
            }`
      }
    >
      {sheet ? (
        <>
          {children}
          <span className={`[&>svg]:h-[22px] [&>svg]:w-[22px] ${danger ? "" : "text-muted"}`}>{icon}</span>
        </>
      ) : (
        <>
          <span className={`[&>svg]:h-4 [&>svg]:w-4 ${danger ? "" : "text-muted"}`}>{icon}</span>
          {children}
        </>
      )}
    </button>
  );
}
