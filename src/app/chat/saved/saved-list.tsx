"use client";

import Link from "next/link";
import { use, useState } from "react";
import { BookmarkIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { useConversationsPromise, usePeople } from "@/components/session-provider";
import { plainText } from "@/lib/rich-text";
import { createClient } from "@/lib/supabase/client";
import { conversationTitle, type SavedItem } from "@/lib/types";
import { EmptyList, LIST_CLASS, ROW_DIVIDER } from "../page-shell";

export function SavedList({ meId, initialItems }: { meId: string; initialItems: SavedItem[] }) {
  const people = usePeople();
  const conversations = use(useConversationsPromise());
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);

  async function unsave(item: SavedItem) {
    setItems((prev) => prev.filter((i) => i.message_id !== item.message_id));
    const { error } = await createClient()
      .from("saved_messages")
      .delete()
      .eq("message_id", item.message_id);
    if (error) {
      setItems((prev) => [item, ...prev]);
      setError(`Couldn't remove it: ${error.message}`);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyList
        icon={<BookmarkIcon className="h-7 w-7" />}
        title="Nothing saved yet"
        body="Long-press a message (or use its … menu) and choose Save to keep it here."
      />
    );
  }

  const titles = new Map(conversations.map((c) => [c.id, conversationTitle(c, c.members, meId)]));

  return (
    <>
      {error && (
        <p className="mx-4 mb-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger md:mx-0">{error}</p>
      )}
      <ul className={LIST_CLASS}>
        {items.map((item) => {
          const message = item.messages!;
          const snippet =
            plainText(message.content) || (message.attachments[0] ? `📎 ${message.attachments[0].name}` : "");
          return (
            <li key={item.message_id} className="group/row relative flex gap-3 pl-4 transition hover:bg-hover active:bg-hover">
              <span className="mt-3">
                <PersonAvatar userId={message.user_id} size="lg" showStatus={false} />
              </span>
              <div className={`flex min-w-0 flex-1 items-start ${ROW_DIVIDER}`}>
                {/* The link's ::before stretches over the whole row. */}
                <Link
                  href={`/chat/${message.room_id}?m=${message.id}`}
                  className="min-w-0 flex-1 py-3 before:absolute before:inset-0"
                >
                  <span className="flex items-baseline gap-1 text-[15px] sm:text-sm">
                    <span className="truncate font-semibold">
                      {people.get(message.user_id)?.username ?? "Unknown"}
                    </span>
                    {titles.get(message.room_id) && (
                      <span className="truncate text-muted">· {titles.get(message.room_id)}</span>
                    )}
                  </span>
                  <span className="mt-0.5 line-clamp-3 text-[15px] leading-snug sm:text-sm">{snippet}</span>
                  <time
                    dateTime={message.created_at}
                    suppressHydrationWarning
                    className="mt-1 block text-xs text-muted"
                  >
                    {new Date(message.created_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </Link>
                <button
                  type="button"
                  onClick={() => unsave(item)}
                  aria-label="Remove from saved"
                  title="Remove from saved"
                  className="icon-btn relative z-10 m-2 text-accent-text"
                >
                  <BookmarkIcon className="h-[18px] w-[18px] fill-current" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
