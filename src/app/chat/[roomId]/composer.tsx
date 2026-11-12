"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
  type SVGProps,
} from "react";
import { Avatar } from "@/components/avatar";
import {
  BoldIcon,
  CloseIcon,
  CodeIcon,
  FileIcon,
  FormatIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  PaperclipIcon,
  QuoteIcon,
  SendIcon,
  SmileIcon,
  StrikeIcon,
} from "@/components/icons";
import { randomId } from "@/lib/compat";
import { EMOJI_GROUPS } from "@/lib/emoji";
import { plainText } from "@/lib/rich-text";
import { createClient } from "@/lib/supabase/client";
import type { Attachment, Member, MessagePreview } from "@/lib/types";
import { formatBytes } from "./attachments";
import { MAX_LENGTH } from "./message-item";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 10;

export type OutgoingMessage = {
  content: string;
  mentions: string[];
  attachments: Attachment[];
  replyTo: MessagePreview | null;
};

type Upload = {
  id: string;
  name: string;
  size: number;
  type: string;
  path: string | null;
  status: "uploading" | "ready" | "error";
};

type MentionState = { query: string; start: number; index: number };

const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file";

export function Composer({
  roomId,
  candidates,
  replyTo,
  replyAuthor,
  typingLabel,
  error,
  onDismissError,
  onCancelReply,
  onSend,
  onTyping,
}: {
  roomId: string;
  /** People who can be @mentioned here. */
  candidates: Member[];
  replyTo: MessagePreview | null;
  replyAuthor: string;
  typingLabel: string;
  error: string | null;
  onDismissError: () => void;
  onCancelReply: () => void;
  onSend: (message: OutgoingMessage) => Promise<boolean>;
  onTyping: (draft: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [showFormat, setShowFormat] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);

  // Restore the caret after programmatic edits (formatting, mentions, emoji).
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    const el = textareaRef.current;
    if (!selection || !el) return;
    pendingSelection.current = null;
    el.focus();
    el.setSelectionRange(selection[0], selection[1]);
  }, [draft]);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    if (!emojiOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!emojiRef.current?.contains(e.target as Node)) setEmojiOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEmojiOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [emojiOpen]);

  const matches = mention
    ? candidates
        .filter((p) => p.username.toLowerCase().includes(mention.query))
        .sort(
          (a, b) =>
            Number(!a.username.toLowerCase().startsWith(mention.query)) -
              Number(!b.username.toLowerCase().startsWith(mention.query)) ||
            a.username.localeCompare(b.username),
        )
        .slice(0, 6)
    : [];

  function changeDraft(value: string, caret: number) {
    setDraft(value);
    onTyping(value);
    const match = /(^|\s)@([^\s@]{0,30})$/.exec(value.slice(0, caret));
    setMention(match ? { query: match[2].toLowerCase(), start: caret - match[2].length - 1, index: 0 } : null);
  }

  function edit(next: string, selection: [number, number]) {
    pendingSelection.current = selection;
    setDraft(next);
    onTyping(next);
  }

  function selection(): [number, number] {
    const el = textareaRef.current;
    return el ? [el.selectionStart, el.selectionEnd] : [draft.length, draft.length];
  }

  function wrap(before: string, after = before, placeholder = "text") {
    const [s, e] = selection();
    const inner = draft.slice(s, e) || placeholder;
    edit(draft.slice(0, s) + before + inner + after + draft.slice(e), [
      s + before.length,
      s + before.length + inner.length,
    ]);
  }

  function prefixLines(prefix: (i: number) => string) {
    const [s, e] = selection();
    const lineStart = draft.lastIndexOf("\n", s - 1) + 1;
    const block = draft
      .slice(lineStart, e)
      .split("\n")
      .map((line, i) => prefix(i) + line)
      .join("\n");
    edit(draft.slice(0, lineStart) + block + draft.slice(e), [lineStart, lineStart + block.length]);
  }

  function insert(text: string) {
    const [s, e] = selection();
    edit(draft.slice(0, s) + text + draft.slice(e), [s + text.length, s + text.length]);
  }

  function pickMention(person: Member) {
    if (!mention) return;
    const [caret] = selection();
    const text = `@${person.username} `;
    edit(draft.slice(0, mention.start) + text + draft.slice(caret), [
      mention.start + text.length,
      mention.start + text.length,
    ]);
    setMentionIds((prev) => (prev.includes(person.id) ? prev : [...prev, person.id]));
    setMention(null);
  }

  async function addFiles(files: FileList | File[]) {
    setLocalError(null);
    const list = Array.from(files);
    const space = MAX_FILES - uploads.length;
    if (list.length > space) setLocalError(`You can attach up to ${MAX_FILES} files per message.`);

    const accepted = list.slice(0, Math.max(0, space)).filter((file) => {
      if (file.size <= MAX_FILE_BYTES) return true;
      setLocalError(`${file.name} is larger than 25 MB.`);
      return false;
    });
    const batch: Upload[] = accepted.map((file) => ({
      id: randomId(),
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      path: null,
      status: "uploading",
    }));
    setUploads((prev) => [...prev, ...batch]);

    const storage = createClient().storage.from("attachments");
    await Promise.all(
      batch.map(async (upload, i) => {
        const path = `${roomId}/${upload.id}/${safeName(upload.name)}`;
        const { error } = await storage.upload(path, accepted[i], {
          contentType: upload.type,
          upsert: false,
        });
        setUploads((prev) =>
          prev.map((u) =>
            u.id === upload.id
              ? { ...u, status: error ? "error" : "ready", path: error ? null : path }
              : u,
          ),
        );
      }),
    );
  }

  function removeUpload(upload: Upload) {
    setUploads((prev) => prev.filter((u) => u.id !== upload.id));
    if (upload.path) void createClient().storage.from("attachments").remove([upload.path]);
  }

  async function send() {
    const content = draft.trim();
    const ready = uploads.filter((u) => u.status === "ready" && u.path);
    if (uploads.some((u) => u.status === "uploading")) return;
    if (!content && ready.length === 0) return;
    if (content.length > MAX_LENGTH) {
      setLocalError(`Messages can be at most ${MAX_LENGTH} characters.`);
      return;
    }

    const names = new Map(candidates.map((c) => [c.id, c.username]));
    const mentions = mentionIds.filter((id) => {
      const name = names.get(id);
      return name && content.includes(`@${name}`);
    });
    const attachments = ready.map((u) => ({ path: u.path!, name: u.name, size: u.size, type: u.type }));

    const snapshot = { draft, mentionIds, uploads };
    setDraft("");
    setMentionIds([]);
    setUploads([]);
    setMention(null);
    setLocalError(null);

    const ok = await onSend({ content, mentions, attachments, replyTo });
    if (!ok) {
      setDraft((current) => current || snapshot.draft);
      setMentionIds(snapshot.mentionIds);
      setUploads((current) => (current.length ? current : snapshot.uploads));
    }
    textareaRef.current?.focus();
  }

  function onDrop(e: DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragging(false);
    void addFiles(e.dataTransfer.files);
  }

  const uploading = uploads.some((u) => u.status === "uploading");
  const canSend = !uploading && (!!draft.trim() || uploads.some((u) => u.status === "ready"));
  const shownError = localError ?? error;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-5"
    >
      <div className="mx-auto max-w-5xl">
        <p className="flex h-6 items-center gap-2 truncate px-1 text-xs text-muted" aria-live="polite">
          {typingLabel && <TypingDots />}
          {typingLabel}
        </p>

        {shownError && (
          <p
            role="alert"
            className="mb-2 flex items-center justify-between gap-2 rounded-md bg-danger/10 px-3 py-1.5 text-xs text-danger"
          >
            <span>{shownError}</span>
            <button
              type="button"
              onClick={() => {
                setLocalError(null);
                onDismissError();
              }}
              aria-label="Dismiss error"
              className="rounded p-0.5 hover:bg-danger/10"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </p>
        )}

        <div
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`relative rounded-md border bg-surface shadow-sm transition focus-within:shadow-[inset_0_-2px_0_0_var(--accent-text)] ${
            dragging ? "border-accent-text border-dashed" : "border-border"
          }`}
        >
          {mention && matches.length > 0 && (
            <ul
              role="listbox"
              aria-label="Mention someone"
              className="absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl"
            >
              {matches.map((person, i) => (
                <li key={person.id} role="option" aria-selected={i === mention.index}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickMention(person)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      i === mention.index ? "bg-hover" : "hover:bg-hover"
                    }`}
                  >
                    <Avatar id={person.id} name={person.username} size="sm" />
                    <span className="truncate">{person.username}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {replyTo && (
            <div className="mx-2 mt-2 flex items-start gap-2 rounded border-l-[3px] border-accent-text/60 bg-black/[0.04] px-2 py-1.5 text-xs dark:bg-white/5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Replying to {replyAuthor}</p>
                <p className="truncate text-muted">
                  {plainText(replyTo.content) ||
                    (replyTo.attachments[0] ? `📎 ${replyTo.attachments[0].name}` : "")}
                </p>
              </div>
              <button
                type="button"
                onClick={onCancelReply}
                aria-label="Cancel reply"
                className="rounded p-0.5 text-muted hover:bg-hover hover:text-foreground"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {showFormat && (
            <div
              role="toolbar"
              aria-label="Formatting"
              className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1"
            >
              <FormatButton label="Bold (Ctrl+B)" Icon={BoldIcon} onClick={() => wrap("**")} />
              <FormatButton label="Italic (Ctrl+I)" Icon={ItalicIcon} onClick={() => wrap("*")} />
              <FormatButton label="Strikethrough" Icon={StrikeIcon} onClick={() => wrap("~~")} />
              <span className="mx-1 h-5 w-px bg-border" />
              <FormatButton label="Code" Icon={CodeIcon} onClick={() => wrap("`", "`", "code")} />
              <FormatButton
                label="Code block"
                Icon={CodeBlockIcon}
                onClick={() => wrap("```\n", "\n```", "code")}
              />
              <FormatButton
                label="Link"
                Icon={LinkIcon}
                onClick={() => wrap("[", "](https://)", "link text")}
              />
              <span className="mx-1 h-5 w-px bg-border" />
              <FormatButton label="Bulleted list" Icon={ListIcon} onClick={() => prefixLines(() => "- ")} />
              <FormatButton
                label="Numbered list"
                Icon={ListOrderedIcon}
                onClick={() => prefixLines((i) => `${i + 1}. `)}
              />
              <FormatButton label="Quote" Icon={QuoteIcon} onClick={() => prefixLines(() => "> ")} />
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => changeDraft(e.target.value, e.target.selectionStart)}
            onClick={(e) => changeDraft(e.currentTarget.value, e.currentTarget.selectionStart)}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                void addFiles(e.clipboardData.files);
              }
            }}
            onKeyDown={(e) => {
              if (mention && matches.length) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const step = e.key === "ArrowDown" ? 1 : -1;
                  setMention({ ...mention, index: (mention.index + step + matches.length) % matches.length });
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  pickMention(matches[mention.index]);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setMention(null);
                  return;
                }
              }
              if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "i")) {
                e.preventDefault();
                wrap(e.key === "b" ? "**" : "*");
                return;
              }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              } else if (e.key === "Escape" && replyTo) {
                onCancelReply();
              }
            }}
            rows={1}
            maxLength={MAX_LENGTH}
            placeholder={replyTo ? "Write a reply" : "Type a message"}
            aria-label="Message"
            className="field-sizing-content block max-h-48 min-h-11 w-full resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted"
          />

          {uploads.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 px-2 pb-2" aria-label="Attachments">
              {uploads.map((upload) => (
                <li
                  key={upload.id}
                  className={`flex max-w-56 items-center gap-2 rounded-md border px-2 py-1 text-xs ${
                    upload.status === "error" ? "border-danger text-danger" : "border-border"
                  }`}
                >
                  <FileIcon className="h-4 w-4 shrink-0 text-accent-text" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{upload.name}</span>
                    <span className="text-muted">
                      {upload.status === "uploading"
                        ? "Uploading…"
                        : upload.status === "error"
                          ? "Upload failed"
                          : formatBytes(upload.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeUpload(upload)}
                    aria-label={`Remove ${upload.name}`}
                    className="shrink-0 rounded p-0.5 text-muted hover:bg-hover hover:text-foreground"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
            <ToolButton
              label={showFormat ? "Hide formatting" : "Format"}
              pressed={showFormat}
              onClick={() => setShowFormat((v) => !v)}
            >
              <FormatIcon className="h-[18px] w-[18px]" />
            </ToolButton>

            <div ref={emojiRef} className="relative">
              <ToolButton label="Emoji" pressed={emojiOpen} onClick={() => setEmojiOpen((v) => !v)}>
                <SmileIcon className="h-[18px] w-[18px]" />
              </ToolButton>
              {emojiOpen && (
                <div
                  role="dialog"
                  aria-label="Emoji"
                  className="absolute bottom-full left-0 z-20 mb-2 h-72 w-72 overflow-y-auto rounded-lg border border-border bg-surface p-2 shadow-xl"
                >
                  {EMOJI_GROUPS.map((group) => (
                    <div key={group.label} className="mb-2">
                      <p className="px-1 pb-1 text-xs font-semibold text-muted">{group.label}</p>
                      <div className="grid grid-cols-8">
                        {group.emoji.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => insert(emoji)}
                            aria-label={emoji}
                            className="flex h-8 w-8 items-center justify-center rounded text-lg hover:bg-hover"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <ToolButton label="Attach files" onClick={() => fileRef.current?.click()}>
              <PaperclipIcon className="h-[18px] w-[18px]" />
            </ToolButton>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send"
              title="Send (Enter) · Shift + Enter for a new line"
              className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-accent-text transition hover:bg-hover disabled:text-muted disabled:hover:bg-transparent"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function ToolButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`icon-btn h-8 w-8 ${pressed ? "bg-hover text-accent-text" : ""}`}
    >
      {children}
    </button>
  );
}

function FormatButton({
  label,
  Icon,
  onClick,
}: {
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="icon-btn h-7 w-7"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function CodeBlockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="m9.5 9.5-2.5 2.5 2.5 2.5M14.5 9.5l2.5 2.5-2.5 2.5" />
    </svg>
  );
}

function TypingDots() {
  return (
    <span aria-hidden className="flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 animate-bounce rounded-full bg-muted"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
