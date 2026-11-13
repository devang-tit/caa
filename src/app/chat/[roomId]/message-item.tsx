"use client";

import {
  memo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { nameColor } from "@/components/avatar";
import { CheckIcon, EyeIcon, MoreIcon, PinIcon, ReplyIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { QUICK_REACTIONS } from "@/lib/emoji";
import { isBigEmoji, plainText, RichText } from "@/lib/rich-text";
import type { ChatMessage, MessagePreview, Reaction } from "@/lib/types";
import { Attachments } from "./attachments";
import { DisappearTimer } from "./disappear-timer";

export const MAX_LENGTH = 2000;

export type Receipt = { seen: boolean; label: string; title?: string };

/** "menu": the … dropdown (mouse). "sheet": the bottom sheet (long-press). */
export type MenuMode = "menu" | "sheet";

type Props = {
  message: ChatMessage;
  mine: boolean;
  /** Continues the previous message's group (same sender, minutes apart). */
  grouped: boolean;
  /** Last message of its group: gets the avatar and the larger gap after. */
  tail: boolean;
  /** Groups and channels show names and avatars on others' messages. */
  showPeople: boolean;
  authorName: string;
  parent: MessagePreview | null;
  parentAuthor: string;
  reactions: Reaction[];
  nameOf: (userId: string) => string;
  meId: string;
  selfName: string;
  mentionNames: string[];
  highlighted: boolean;
  receipt: Receipt | null;
  editText: string | null;
  onReact: (message: ChatMessage, emoji: string) => void;
  onReply: (message: ChatMessage) => void;
  onMenu: (message: ChatMessage, anchor: DOMRect, mode: MenuMode) => void;
  onJump: (id: string) => void;
  onEditChange: (text: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
};

export const MessageItem = memo(function MessageItem(props: Props) {
  const { message, mine, grouped, tail, showPeople, highlighted, editText } = props;
  const isEditing = editText !== null;
  const groups = groupReactions(props.reactions, props.meId, props.nameOf);
  const interactive = !message.pending && !isEditing;
  const bubbleRef = useRef<HTMLDivElement>(null);

  const gestures = useTouchGestures({
    enabled: interactive,
    onLongPress: () => {
      const rect = bubbleRef.current?.getBoundingClientRect();
      if (rect) props.onMenu(message, rect, "sheet");
    },
    onSwipe: () => props.onReply(message),
  });

  // Right-click opens the same menu as "…" (but not on links and images,
  // which keep the browser's own menu).
  function onContextMenu(e: ReactMouseEvent) {
    if (gestures.touchActive()) {
      e.preventDefault(); // long-press on Android: our sheet, not the browser's menu
      return;
    }
    if (!interactive || (e.target as HTMLElement).closest("a, img")) return;
    e.preventDefault();
    props.onMenu(message, new DOMRect(e.clientX, e.clientY, 0, 0), "menu");
  }

  const bigEmoji =
    !isEditing && !props.parent && message.attachments.length === 0 && isBigEmoji(message.content);
  const mediaOnly =
    !isEditing &&
    !props.parent &&
    !message.content.trim() &&
    message.attachments.length > 0 &&
    message.attachments.every((a) => a.type.startsWith("image/"));
  const showName = showPeople && !mine && !grouped;
  const showAvatar = showPeople && !mine;

  const toolbar = interactive && (
    <div
      role="toolbar"
      aria-label="Message actions"
      className={`pointer-events-none absolute -top-4 z-10 flex items-center gap-0.5 rounded-full bg-surface p-1 opacity-0 shadow-float ring-1 ring-border transition group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 pointer-coarse:hidden ${
        mine ? "right-2" : showAvatar ? "left-12" : "left-3"
      }`}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => props.onReact(message, emoji)}
          aria-label={`React with ${emoji}`}
          className="flex h-7 w-7 items-center justify-center rounded-full text-base leading-none transition hover:scale-125 hover:bg-hover"
        >
          {emoji}
        </button>
      ))}
      <span className="mx-0.5 h-5 w-px bg-border" />
      <button
        type="button"
        onClick={() => props.onReply(message)}
        aria-label="Reply"
        title="Reply"
        className="icon-btn h-7 w-7"
      >
        <ReplyIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={(e) => props.onMenu(message, e.currentTarget.getBoundingClientRect(), "menu")}
        aria-label="More options"
        aria-haspopup="menu"
        title="More options"
        className="icon-btn h-7 w-7"
      >
        <MoreIcon className="h-4 w-4" />
      </button>
    </div>
  );

  const meta = (
    <span
      className={`ml-auto flex shrink-0 translate-y-[3px] items-center gap-1 self-end text-[11px] leading-4 text-muted ${
        mediaOnly ? "px-1.5 pb-0.5" : ""
      }`}
    >
      {message.pinned_at && <PinIcon className="h-3 w-3" aria-label="Pinned" />}
      {message.edited_at && <span>edited</span>}
      {message.seen_at && <DisappearTimer seenAt={message.seen_at} />}
      {message.pending ? <span>Sending…</span> : <Timestamp iso={message.created_at} className="text-[11px]" />}
    </span>
  );

  // Rounded, with tighter corners on the sender's side where bubbles of a
  // group meet, and a small "tail" corner at the bottom.
  const shape = mine
    ? `rounded-[20px] rounded-br-[6px] ${grouped ? "rounded-tr-[6px]" : ""}`
    : `rounded-[20px] rounded-bl-[6px] ${grouped ? "rounded-tl-[6px]" : ""}`;
  const tone = bigEmoji
    ? ""
    : mine && !isEditing
      ? "bubble-mine shadow-soft"
      : "bg-theirs text-foreground shadow-soft ring-1 ring-black/[0.03] dark:ring-white/[0.04]";

  const bubble = (
    <div className="relative max-w-full">
      {/* Reply arrow revealed by swiping the message to the right. */}
      <span
        aria-hidden
        style={{
          opacity: Math.min(1, gestures.offset / SWIPE_TRIGGER),
          transform: `translateY(-50%) scale(${0.6 + 0.4 * Math.min(1, gestures.offset / SWIPE_TRIGGER)})`,
        }}
        className={`pointer-events-none absolute top-1/2 -left-11 flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
          gestures.offset >= SWIPE_TRIGGER ? "bg-accent text-accent-foreground" : "bg-surface text-muted shadow-soft"
        } ${gestures.offset ? "" : "invisible"}`}
      >
        <ReplyIcon className="h-4 w-4" />
      </span>

      <div
        ref={bubbleRef}
        className={`max-w-full transition-shadow ${bigEmoji ? "py-0.5" : mediaOnly ? "p-1" : "px-3 pt-1.5 pb-2"} ${tone} ${shape} ${
          isEditing ? "w-[min(32rem,80vw)]" : ""
        } ${highlighted ? "ring-2 ring-accent-text ring-offset-2 ring-offset-background" : ""}`}
      >
        {showName && (
          <p className={`mb-0.5 truncate text-[13px] font-semibold ${nameColor(message.user_id)} ${mediaOnly ? "px-2 pt-1" : ""}`}>
            {props.authorName}
          </p>
        )}

        {props.parent && (
          <button
            type="button"
            onClick={() => props.onJump(props.parent!.id)}
            className="mt-0.5 mb-1 block w-full min-w-40 rounded-xl border-l-[3px] border-accent-text bg-black/[0.05] px-2.5 py-1.5 text-left text-[13px] leading-snug transition hover:bg-black/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/10"
          >
            <span className="block font-semibold text-accent-text">{props.parentAuthor}</span>
            <span className="line-clamp-2 text-muted">
              {plainText(props.parent.content) ||
                (props.parent.attachments.length ? `📎 ${props.parent.attachments[0].name}` : "")}
            </span>
          </button>
        )}

        {isEditing ? (
          <Editor
            text={editText}
            onChange={props.onEditChange}
            onSave={props.onEditSave}
            onCancel={props.onEditCancel}
          />
        ) : (
          <div className="flex flex-wrap items-end gap-x-2.5">
            <div className={`min-w-0 max-w-full ${mediaOnly ? "w-full" : ""}`}>
              <RichText text={message.content} mentionNames={props.mentionNames} selfName={props.selfName} />
              {message.attachments.length > 0 && <Attachments items={message.attachments} />}
            </div>
            {bigEmoji ? (
              <span className="ml-auto self-end rounded-full bg-surface/80 px-1.5 shadow-soft">{meta}</span>
            ) : (
              meta
            )}
          </div>
        )}
      </div>
    </div>
  );

  const reactionsRow = groups.length > 0 && (
    <div className={`relative z-[1] -mt-1.5 flex flex-wrap gap-1 px-2 ${mine ? "justify-end" : ""}`}>
      {groups.map((g) => (
        <button
          key={g.emoji}
          type="button"
          onClick={() => props.onReact(message, g.emoji)}
          aria-pressed={g.mine}
          aria-label={`${g.emoji} ${g.count}: ${g.names.join(", ")}`}
          title={g.names.join(", ")}
          className={`flex h-6 items-center gap-1 rounded-full px-1.5 text-xs font-semibold shadow-soft ring-1 transition active:scale-95 ${
            g.mine
              ? "bg-accent-soft text-accent-text ring-accent-text/40"
              : "bg-surface text-foreground ring-border hover:bg-hover"
          }`}
        >
          <span className="text-sm leading-none">{g.emoji}</span>
          {g.count > 1 && g.count}
        </button>
      ))}
    </div>
  );

  return (
    // tabIndex lets keyboard and touch focus reveal the toolbar (desktop).
    <li
      id={`msg-${message.id}`}
      tabIndex={-1}
      onContextMenu={onContextMenu}
      {...gestures.handlers}
      className={`group touch-message relative touch-pan-y outline-none ${grouped ? "mt-0.5" : "mt-3 first:mt-0"} ${
        message.pending ? "opacity-70" : ""
      }`}
    >
      <div
        style={{
          transform: gestures.offset ? `translateX(${gestures.offset}px)` : undefined,
          transition: gestures.swiping ? "none" : "transform 0.3s var(--ease-spring)",
        }}
        className={
          mine
            ? "flex flex-col items-end pl-12 sm:pl-[18%]"
            : "flex items-end gap-2 pr-12 sm:pr-[18%]"
        }
      >
        {showAvatar && (
          <div className="mb-0.5 w-8 shrink-0 self-end">
            {tail && <PersonAvatar userId={message.user_id} name={props.authorName} size="md" showStatus={false} />}
          </div>
        )}
        {mine ? (
          <>
            {bubble}
            {reactionsRow}
            {props.receipt && (
              <p
                className="mt-1 mr-1 flex items-center gap-1 text-[11px] font-medium text-muted"
                title={props.receipt.title}
              >
                {props.receipt.seen ? (
                  <EyeIcon className="h-3.5 w-3.5 text-accent-text" />
                ) : (
                  <CheckIcon className="h-3.5 w-3.5" />
                )}
                {props.receipt.label}
              </p>
            )}
          </>
        ) : (
          <div className="flex min-w-0 flex-col items-start">
            {bubble}
            {reactionsRow}
          </div>
        )}
      </div>
      {toolbar}
    </li>
  );
});

// ── Touch gestures: long-press for the action sheet, swipe right to reply ────

const LONG_PRESS_MS = 420;
const MOVE_TOLERANCE_PX = 8;
const SWIPE_TRIGGER = 56;
const SWIPE_MAX = 84;

function haptic() {
  // Android only; iPhone ignores it.
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(8);
}

function useTouchGestures({
  enabled,
  onLongPress,
  onSwipe,
}: {
  enabled: boolean;
  onLongPress: () => void;
  onSwipe: () => void;
}) {
  const gesture = useRef<{
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
    phase: "pending" | "swipe" | "pressed";
  } | null>(null);
  const suppressClick = useRef(false);
  const armed = useRef(false);
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);

  function reset() {
    if (gesture.current) clearTimeout(gesture.current.timer);
    gesture.current = null;
    armed.current = false;
    setSwiping(false);
    setOffset(0);
  }

  const handlers = {
    onPointerDown(e: ReactPointerEvent) {
      suppressClick.current = false;
      if (!enabled || e.pointerType === "mouse" || !e.isPrimary) return;
      // Leave buttons, the editor and scrollable code blocks alone.
      if ((e.target as HTMLElement).closest("button, textarea, pre")) return;
      const timer = setTimeout(() => {
        if (gesture.current?.phase !== "pending") return;
        gesture.current.phase = "pressed";
        suppressClick.current = true;
        haptic();
        onLongPress();
      }, LONG_PRESS_MS);
      gesture.current = { x: e.clientX, y: e.clientY, timer, phase: "pending" };
    },
    onPointerMove(e: ReactPointerEvent) {
      const g = gesture.current;
      if (!g || g.phase === "pressed") return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (g.phase === "pending") {
        if (Math.abs(dx) < MOVE_TOLERANCE_PX && Math.abs(dy) < MOVE_TOLERANCE_PX) return;
        clearTimeout(g.timer);
        // Mostly sideways and to the right: a swipe. Anything else is a scroll.
        if (dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          g.phase = "swipe";
          suppressClick.current = true;
          setSwiping(true);
        } else {
          gesture.current = null;
          return;
        }
      }
      const next = Math.min(SWIPE_MAX, Math.max(0, (dx - MOVE_TOLERANCE_PX) * 0.65));
      if (next >= SWIPE_TRIGGER && !armed.current) haptic();
      armed.current = next >= SWIPE_TRIGGER;
      setOffset(next);
    },
    onPointerUp() {
      if (gesture.current?.phase === "swipe" && armed.current) onSwipe();
      reset();
    },
    onPointerCancel: reset,
    onClickCapture(e: ReactMouseEvent) {
      // The finger lifting after a long-press mustn't also tap a link.
      if (!suppressClick.current) return;
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  return {
    offset,
    swiping,
    handlers,
    /** A finger is down on this message (to tell long-press from right-click). */
    touchActive: () => gesture.current !== null,
  };
}

function groupReactions(reactions: Reaction[], meId: string, nameOf: (id: string) => string) {
  const map = new Map<string, { emoji: string; count: number; mine: boolean; names: string[] }>();
  for (const r of reactions) {
    const group = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, names: [] };
    group.count += 1;
    group.mine ||= r.user_id === meId;
    group.names.push(r.user_id === meId ? "You" : nameOf(r.user_id));
    map.set(r.emoji, group);
  }
  return [...map.values()];
}

function Editor({
  text,
  onChange,
  onSave,
  onCancel,
}: {
  text: string;
  onChange: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-1 space-y-2">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSave();
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
        maxLength={MAX_LENGTH}
        aria-label="Edit message"
        className="input field-sizing-content max-h-40 resize-none"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary px-3 py-1.5 text-xs">
          Cancel
        </button>
        <button type="button" onClick={onSave} className="btn-primary px-3 py-1.5 text-xs">
          Save
        </button>
      </div>
    </div>
  );
}

export function Timestamp({ iso, className = "text-xs" }: { iso: string; className?: string }) {
  const date = new Date(iso);
  // Server and browser can be in different time zones; the client value wins.
  return (
    <time
      dateTime={iso}
      title={date.toLocaleString()}
      suppressHydrationWarning
      className={`text-muted ${className}`}
    >
      {date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
    </time>
  );
}
