"use client";

import Link from "next/link";
import { use, useState } from "react";
import { BookmarkIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { useConversationsPromise, usePeople } from "@/components/session-provider";
import { plainText } from "@/lib/rich-text";
import { createClient } from "@/lib/supabase/client";
import { conversationTitle, type SavedItem } from "@/lib/types";
import { EmptyList } from "../page-shell";

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
        body="Open the … menu on any message and choose “Save this message” to keep it here."
      />
    );
  }

  const titles = new Map(conversations.map((c) => [c.id, conversationTitle(c, c.members, meId)]));

  return (
    <>
      {error && <p className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <ul className="overflow-hidden rounded-lg border border-border bg-surface">
        {items.map((item) => {
          const message = item.messages!;
          const snippet =
            plainText(message.content) || (message.attachments[0] ? `📎 ${message.attachments[0].name}` : "");
          return (
            <li key={item.message_id} className="flex items-start gap-1 border-b border-border last:border-0">
              <Link
                href={`/chat/${message.room_id}?m=${message.id}`}
                className="flex min-w-0 flex-1 gap-3 px-4 py-3 transition hover:bg-hover"
              >
                <PersonAvatar userId={message.user_id} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">
                      {people.get(message.user_id)?.username ?? "Unknown"}
                    </span>
                    {titles.get(message.room_id) && (
                      <span className="text-muted"> in {titles.get(message.room_id)}</span>
                    )}
                  </p>
                  <p className="mt-0.5 line-clamp-3 text-sm">{snippet}</p>
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
                </div>
              </Link>
              <button
                type="button"
                onClick={() => unsave(item)}
                aria-label="Remove from saved"
                title="Remove from saved"
                className="icon-btn m-2 text-accent-text"
              >
                <BookmarkIcon className="h-4 w-4 fill-current" />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
