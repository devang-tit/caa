"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BookmarkIcon, CopyIcon, EditIcon, PinIcon, ReplyIcon, TrashIcon } from "@/components/icons";
import type { ChatMessage } from "@/lib/types";

export type MenuState = { message: ChatMessage; anchor: DOMRect };

const WIDTH = 208;

/** The "…" menu for a message, positioned next to the button that opened it. */
export function MessageMenu({
  state,
  mine,
  saved,
  onClose,
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
  onClose: () => void;
  onReply: () => void;
  onTogglePin: () => void;
  onToggleSave: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Measure after render so the menu can flip above the button near the bottom.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { anchor } = state;
    const height = el.offsetHeight;
    const below = anchor.bottom + 4;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, anchor.top - height - 4) : below;
    const left = Math.min(Math.max(8, anchor.right - WIDTH), window.innerWidth - WIDTH - 8);
    setPosition({ top, left });
    el.querySelector<HTMLButtonElement>("button")?.focus();
  }, [state]);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Message options"
      style={{ top: position?.top ?? -9999, left: position?.left ?? -9999, width: WIDTH }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }}
      className="fixed z-50 rounded-lg border border-border bg-surface p-1 text-foreground shadow-xl"
    >
      <Item icon={<ReplyIcon className="h-4 w-4" />} onClick={run(onReply)}>
        Reply
      </Item>
      <Item icon={<PinIcon className="h-4 w-4" />} onClick={run(onTogglePin)}>
        {state.message.pinned_at ? "Unpin" : "Pin"}
      </Item>
      <Item icon={<BookmarkIcon className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />} onClick={run(onToggleSave)}>
        {saved ? "Remove from saved" : "Save this message"}
      </Item>
      {state.message.content.trim() && (
        <Item icon={<CopyIcon className="h-4 w-4" />} onClick={run(onCopy)}>
          Copy text
        </Item>
      )}
      {mine && (
        <>
          <div className="my-1 h-px bg-border" />
          <Item icon={<EditIcon className="h-4 w-4" />} onClick={run(onEdit)}>
            Edit
          </Item>
          <Item icon={<TrashIcon className="h-4 w-4" />} onClick={run(onDelete)} danger>
            Delete
          </Item>
        </>
      )}
    </div>
  );
}

function Item({
  icon,
  children,
  onClick,
  danger = false,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm outline-none transition hover:bg-hover focus-visible:bg-hover ${
        danger ? "text-danger" : ""
      }`}
    >
      <span className={danger ? "" : "text-muted"}>{icon}</span>
      {children}
    </button>
  );
}
