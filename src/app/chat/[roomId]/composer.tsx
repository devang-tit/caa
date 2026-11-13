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
  ArrowUpIcon,
  BoldIcon,
  CloseIcon,
  CodeIcon,
  FileIcon,
  FormatIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  PlusIcon,
  QuoteIcon,
  SmileIcon,
  StrikeIcon,
} from "@/components/icons";
import { randomId } from "@/lib/compat";
import { prepareImage } from "@/lib/image";
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
  width?: number;
  height?: number;
  /** Local object URL for an image thumbnail while composing. */
  preview?: string;
};

type MentionState = { query: string; start: number; index: number };

const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file";

export function Composer({
  roomId,
  candidates,
  replyTo,
  replyAuthor,
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
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);
  const uploadsRef = useRef(uploads);

  useEffect(() => {
    uploadsRef.current = uploads;
  });

  // Thumbnails are object URLs: release whatever is still attached on leaving.
  useEffect(
    () => () => {
      for (const u of uploadsRef.current) if (u.preview) URL.revokeObjectURL(u.preview);
    },
    [],
  );

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
      const target = e.target as Node;
      // The toggle button handles its own clicks.
      if (!emojiRef.current?.contains(target) && !emojiButtonRef.current?.contains(target)) {
        setEmojiOpen(false);
      }
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

    // Big photos usually shrink well under the limit, so only other files are
    // turned away up front.
    const accepted = list.slice(0, Math.max(0, space)).filter((file) => {
      if (file.size <= MAX_FILE_BYTES || file.type.startsWith("image/")) return true;
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
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setUploads((prev) => [...prev, ...batch]);

    const storage = createClient().storage.from("attachments");
    await Promise.all(
      batch.map(async (upload, i) => {
        const { file, width, height } = await prepareImage(accepted[i]);
        if (file.size > MAX_FILE_BYTES) {
          setLocalError(`${upload.name} is larger than 25 MB.`);
          setUploads((prev) => prev.filter((u) => u.id !== upload.id));
          if (upload.preview) URL.revokeObjectURL(upload.preview);
          return;
        }
        const type = file.type || "application/octet-stream";
        const path = `${roomId}/${upload.id}/${safeName(file.name)}`;
        const { error } = await storage.upload(path, file, { contentType: type, upsert: false });
        setUploads((prev) =>
          prev.map((u) =>
            u.id === upload.id
              ? {
                  ...u,
                  name: file.name,
                  size: file.size,
                  type,
                  width,
                  height,
                  status: error ? "error" : "ready",
                  path: error ? null : path,
                }
              : u,
          ),
        );
      }),
    );
  }

  function removeUpload(upload: Upload) {
    setUploads((prev) => prev.filter((u) => u.id !== upload.id));
    if (upload.preview) URL.revokeObjectURL(upload.preview);
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
    const attachments: Attachment[] = ready.map((u) => ({
      path: u.path!,
      name: u.name,
      size: u.size,
      type: u.type,
      ...(u.width && u.height ? { width: u.width, height: u.height } : {}),
    }));

    const snapshot = { draft, mentionIds, uploads };
    setDraft("");
    setMentionIds([]);
    setUploads([]);
    setMention(null);
    setLocalError(null);

    const ok = await onSend({ content, mentions, attachments, replyTo });
    if (ok) {
      for (const u of snapshot.uploads) if (u.preview) URL.revokeObjectURL(u.preview);
    } else {
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
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className="shrink-0 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4"
    >
      <div className="relative mx-auto max-w-4xl">
        {shownError && (
          <p
            role="alert"
            className="animate-rise-in mb-2 flex items-center justify-between gap-2 rounded-2xl bg-danger/10 px-3.5 py-2 text-sm text-danger"
          >
            <span>{shownError}</span>
            <button
              type="button"
              onClick={() => {
                setLocalError(null);
                onDismissError();
              }}
              aria-label="Dismiss error"
              className="rounded-full p-1 hover:bg-danger/10"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </p>
        )}

        {mention && matches.length > 0 && (
          <ul
            role="listbox"
            aria-label="Mention someone"
            className="animate-rise-in absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-2xl bg-surface p-1.5 shadow-float ring-1 ring-border sm:w-72"
          >
            {matches.map((person, i) => (
              <li key={person.id} role="option" aria-selected={i === mention.index}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickMention(person)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[15px] sm:text-sm ${
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

        {emojiOpen && (
          <div
            ref={emojiRef}
            role="dialog"
            aria-label="Emoji"
            className="animate-rise-in absolute right-0 bottom-full left-0 z-20 mb-2 h-72 overflow-y-auto overscroll-contain rounded-3xl bg-surface p-3 shadow-float ring-1 ring-border sm:left-auto sm:w-88"
          >
            {EMOJI_GROUPS.map((group) => (
              <div key={group.label} className="mb-2">
                <p className="sticky -top-3 z-[1] -mx-3 bg-surface/95 px-4 pt-1 pb-1.5 text-xs font-semibold text-muted">
                  {group.label}
                </p>
                <div className="grid grid-cols-8">
                  {group.emoji.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insert(emoji)}
                      aria-label={emoji}
                      className="flex aspect-square items-center justify-center rounded-xl text-2xl transition hover:bg-hover active:scale-90"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {replyTo && (
          <div className="animate-rise-in mb-2 flex items-center gap-3 rounded-2xl bg-surface py-2 pr-2 pl-3 shadow-soft ring-1 ring-border">
            <span className="h-9 w-[3px] shrink-0 rounded-full bg-accent" />
            <div className="min-w-0 flex-1 text-[13px] leading-snug">
              <p className="font-semibold text-accent-text">Replying to {replyAuthor}</p>
              <p className="truncate text-muted">
                {plainText(replyTo.content) ||
                  (replyTo.attachments[0] ? `📎 ${replyTo.attachments[0].name}` : "")}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              aria-label="Cancel reply"
              className="icon-btn h-8 w-8 pointer-coarse:h-9 pointer-coarse:w-9"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {uploads.length > 0 && (
          <ul className="mb-2 flex gap-2 overflow-x-auto pt-1.5 pb-1 [scrollbar-width:none]" aria-label="Attachments">
            {uploads.map((upload) => (
              <li key={upload.id} className="animate-rise-in relative shrink-0">
                {upload.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={upload.preview}
                    alt={upload.name}
                    className={`h-16 w-16 rounded-2xl object-cover ring-1 ring-border ${
                      upload.status === "error" ? "opacity-40" : ""
                    }`}
                  />
                ) : (
                  <span
                    className={`flex h-16 w-52 items-center gap-2.5 rounded-2xl bg-surface px-3 ring-1 ${
                      upload.status === "error" ? "text-danger ring-danger" : "ring-border"
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <FileIcon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 text-xs">
                      <span className="block truncate font-semibold">{upload.name}</span>
                      <span className="text-muted">{formatBytes(upload.size)}</span>
                    </span>
                  </span>
                )}
                {upload.status !== "ready" && (
                  <span
                    className={`absolute inset-0 flex items-center justify-center rounded-2xl text-[11px] font-semibold ${
                      upload.status === "error" ? "text-danger" : "bg-black/30 text-white"
                    }`}
                  >
                    {upload.status === "uploading" ? (
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      "Failed"
                    )}
                    <span className="sr-only">
                      {upload.status === "uploading" ? `Uploading ${upload.name}` : `${upload.name} failed`}
                    </span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeUpload(upload)}
                  aria-label={`Remove ${upload.name}`}
                  className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background shadow-soft ring-2 ring-background"
                >
                  <CloseIcon className="h-3.5 w-3.5" strokeWidth={2.2} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {showFormat && (
          <div
            role="toolbar"
            aria-label="Formatting"
            className="animate-rise-in mb-2 flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-surface p-1 shadow-soft ring-1 ring-border [scrollbar-width:none]"
          >
            <FormatButton label="Bold (Ctrl+B)" Icon={BoldIcon} onClick={() => wrap("**")} />
            <FormatButton label="Italic (Ctrl+I)" Icon={ItalicIcon} onClick={() => wrap("*")} />
            <FormatButton label="Strikethrough" Icon={StrikeIcon} onClick={() => wrap("~~")} />
            <span className="mx-1 h-5 w-px shrink-0 bg-border" />
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
            <span className="mx-1 h-5 w-px shrink-0 bg-border" />
            <FormatButton label="Bulleted list" Icon={ListIcon} onClick={() => prefixLines(() => "- ")} />
            <FormatButton
              label="Numbered list"
              Icon={ListOrderedIcon}
              onClick={() => prefixLines((i) => `${i + 1}. `)}
            />
            <FormatButton label="Quote" Icon={QuoteIcon} onClick={() => prefixLines(() => "> ")} />
          </div>
        )}

        <div className="flex items-end gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach photos or files"
            title="Attach photos or files"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-muted shadow-soft ring-1 ring-border transition hover:text-foreground active:scale-95"
          >
            <PlusIcon className="h-6 w-6" />
          </button>
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

          <div
            className={`flex min-w-0 flex-1 items-end rounded-[22px] bg-surface shadow-soft ring-1 transition focus-within:ring-2 focus-within:ring-accent/40 ${
              dragging ? "ring-2 ring-accent-text ring-offset-2 ring-offset-background" : "ring-border"
            }`}
          >
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
                // Phones: Enter is a new line; send with the button.
                const touch = window.matchMedia("(pointer: coarse)").matches;
                if (e.key === "Enter" && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                } else if (e.key === "Escape" && replyTo) {
                  onCancelReply();
                }
              }}
              rows={1}
              maxLength={MAX_LENGTH}
              placeholder={replyTo ? "Reply…" : "Message"}
              aria-label="Message"
              className="field-sizing-content block max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 pr-1 pl-4 text-base leading-6 outline-none placeholder:text-muted sm:text-sm sm:leading-6"
            />
            <div className="flex shrink-0 items-center pr-1 pb-0.5">
              <ToolButton
                label={showFormat ? "Hide formatting" : "Formatting"}
                pressed={showFormat}
                onClick={() => setShowFormat((v) => !v)}
              >
                <FormatIcon className="h-5 w-5" />
              </ToolButton>
              <ToolButton
                label="Emoji"
                pressed={emojiOpen}
                onClick={() => setEmojiOpen((v) => !v)}
                buttonRef={emojiButtonRef}
              >
                <SmileIcon className="h-5 w-5" />
              </ToolButton>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            title="Send (Enter) · Shift + Enter for a new line"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-soft transition hover:bg-accent-hover active:scale-90 disabled:bg-surface disabled:text-muted disabled:ring-1 disabled:ring-border disabled:active:scale-100"
          >
            <ArrowUpIcon className="h-5 w-5" strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </form>
  );
}

function ToolButton({
  label,
  pressed,
  onClick,
  buttonRef,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
  children: React.ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`icon-btn h-9 w-9 pointer-coarse:h-10 pointer-coarse:w-10 ${pressed ? "bg-accent-soft text-accent-text" : ""}`}
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
