"use client";

import { memo } from "react";
import { CheckIcon, EyeIcon, MoreIcon, PinIcon, ReplyIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { QUICK_REACTIONS } from "@/lib/emoji";
import { plainText, RichText } from "@/lib/rich-text";
import type { ChatMessage, MessagePreview, Reaction } from "@/lib/types";
import { Attachments } from "./attachments";
import { DisappearTimer } from "./disappear-timer";

export const MAX_LENGTH = 2000;

export type Receipt = { seen: boolean; label: string; title?: string };

type Props = {
  message: ChatMessage;
  mine: boolean;
  grouped: boolean;
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
  onMenu: (message: ChatMessage, anchor: DOMRect) => void;
  onJump: (id: string) => void;
  onEditChange: (text: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
};

export const MessageItem = memo(function MessageItem(props: Props) {
  const { message, mine, grouped, highlighted, editText } = props;
  const isEditing = editText !== null;
  const spacing = grouped ? "mt-0.5" : "mt-4 first:mt-0";
  const groups = groupReactions(props.reactions, props.meId, props.nameOf);

  const toolbar = !message.pending && !isEditing && (
    <div
      role="toolbar"
      aria-label="Message actions"
      className={`pointer-events-none absolute -top-5 z-10 flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5 opacity-0 shadow-md transition group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 ${
        mine ? "right-1" : "left-10"
      }`}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => props.onReact(message, emoji)}
          aria-label={`React with ${emoji}`}
          className="flex h-7 w-7 items-center justify-center rounded text-base leading-none transition hover:scale-125 hover:bg-hover"
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
        onClick={(e) => props.onMenu(message, e.currentTarget.getBoundingClientRect())}
        aria-label="More options"
        aria-haspopup="menu"
        title="More options"
        className="icon-btn h-7 w-7"
      >
        <MoreIcon className="h-4 w-4" />
      </button>
    </div>
  );

  const showMeta = !grouped || message.edited_at || message.pinned_at || message.seen_at;

  const bubble = (
    <div
      className={`max-w-full rounded-md px-3.5 py-2 transition-shadow ${
        mine ? "bg-mine" : "bg-surface shadow-sm"
      } ${isEditing ? "w-full" : ""} ${highlighted ? "ring-2 ring-accent-text" : ""}`}
    >
      {showMeta && (
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
          {!mine && !grouped && (
            <span className="truncate font-semibold text-foreground">{props.authorName}</span>
          )}
          {!grouped && <Timestamp iso={message.created_at} />}
          {message.edited_at && <span>Edited</span>}
          {message.pinned_at && (
            <span className="flex items-center gap-0.5">
              <PinIcon className="h-3 w-3" />
              Pinned
            </span>
          )}
          {message.seen_at && <DisappearTimer seenAt={message.seen_at} />}
        </div>
      )}

      {props.parent && (
        <button
          type="button"
          onClick={() => props.onJump(props.parent!.id)}
          className="mb-1 mt-1 block w-full rounded border-l-[3px] border-accent-text/60 bg-black/[0.04] px-2 py-1 text-left text-xs transition hover:bg-black/[0.07] dark:bg-white/5 dark:hover:bg-white/10"
        >
          <span className="font-semibold">{props.parentAuthor}</span>
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
        <>
          <RichText
            text={message.content}
            mentionNames={props.mentionNames}
            selfName={props.selfName}
          />
          {message.attachments.length > 0 && <Attachments items={message.attachments} />}
          {message.pending && <p className="mt-0.5 text-xs text-muted">Sending…</p>}
        </>
      )}
    </div>
  );

  const reactionsRow = groups.length > 0 && (
    <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
      {groups.map((g) => (
        <button
          key={g.emoji}
          type="button"
          onClick={() => props.onReact(message, g.emoji)}
          aria-pressed={g.mine}
          aria-label={`${g.emoji} ${g.count}: ${g.names.join(", ")}`}
          title={g.names.join(", ")}
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold transition ${
            g.mine
              ? "border-accent-text bg-accent/10 text-accent-text"
              : "border-border bg-surface hover:bg-hover"
          }`}
        >
          <span className="text-sm leading-none">{g.emoji}</span>
          {g.count}
        </button>
      ))}
    </div>
  );

  if (mine) {
    return (
      // tabIndex lets a tap on touch screens focus the row and reveal its actions.
      <li
        id={`msg-${message.id}`}
        tabIndex={-1}
        className={`group relative flex flex-col items-end pl-10 outline-none sm:pl-[20%] ${spacing} ${
          message.pending ? "opacity-70" : ""
        }`}
      >
        {bubble}
        {reactionsRow}
        {props.receipt && (
          <p
            className="mt-0.5 flex items-center gap-1 text-[11px] text-muted"
            title={props.receipt.title}
          >
            {props.receipt.seen ? <EyeIcon className="h-3.5 w-3.5" /> : <CheckIcon className="h-3.5 w-3.5" />}
            {props.receipt.label}
          </p>
        )}
        {toolbar}
      </li>
    );
  }

  return (
    <li
      id={`msg-${message.id}`}
      tabIndex={-1}
      className={`group relative flex gap-2 pr-10 outline-none sm:pr-[20%] ${spacing}`}
    >
      <div className="w-8 shrink-0">
        {!grouped && <PersonAvatar userId={message.user_id} name={props.authorName} />}
      </div>
      <div className="flex min-w-0 flex-col items-start">
        {bubble}
        {reactionsRow}
      </div>
      {toolbar}
    </li>
  );
});

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
    <div className="mt-1 space-y-1.5">
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
        <button type="button" onClick={onCancel} className="btn-secondary px-2.5 py-1 text-xs">
          Cancel
        </button>
        <button type="button" onClick={onSave} className="btn-primary px-2.5 py-1 text-xs">
          Save
        </button>
      </div>
    </div>
  );
}

export function Timestamp({ iso, className = "" }: { iso: string; className?: string }) {
  const date = new Date(iso);
  // Server and browser can be in different time zones; the client value wins.
  return (
    <time
      dateTime={iso}
      title={date.toLocaleString()}
      suppressHydrationWarning
      className={`text-xs text-muted ${className}`}
    >
      {date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
    </time>
  );
}
