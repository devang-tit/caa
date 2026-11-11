"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { BellIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { useConversationsPromise, usePeople } from "@/components/session-provider";
import { plainText } from "@/lib/rich-text";
import { createClient } from "@/lib/supabase/client";
import { subscribeToChannel } from "@/lib/supabase/realtime";
import {
  conversationTitle,
  type ActivityItem,
  type Attachment,
  type Notification,
} from "@/lib/types";
import { EmptyList } from "../page-shell";

export function ActivityFeed({ meId, initialItems }: { meId: string; initialItems: ActivityItem[] }) {
  const people = usePeople();
  const conversations = use(useConversationsPromise());
  const [items, setItems] = useState(initialItems);
  // Remember what was new when the page opened so it stays highlighted.
  const [fresh] = useState(() => new Set(initialItems.filter((i) => !i.read_at).map((i) => i.id)));

  useEffect(() => {
    const supabase = createClient();
    const markAllRead = () =>
      supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null)
        .then(() => {});

    void markAllRead();
    return subscribeToChannel(supabase, `activity-feed:${meId}`, { config: {} }, (channel) => {
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${meId}` },
        async ({ new: row }) => {
          const n = row as Notification;
          const { data: message } = n.message_id
            ? await supabase
                .from("messages")
                .select("content, attachments")
                .eq("id", n.message_id)
                .maybeSingle<{ content: string; attachments: Attachment[] }>()
            : { data: null };
          setItems((prev) => (prev.some((i) => i.id === n.id) ? prev : [{ ...n, messages: message }, ...prev]));
          void markAllRead();
        },
      );
    });
  }, [meId]);

  if (items.length === 0) {
    return (
      <EmptyList
        icon={<BellIcon className="h-7 w-7" />}
        title="No activity yet"
        body="When someone @mentions you, replies to you or reacts to your messages, it shows up here."
      />
    );
  }

  const titles = new Map(conversations.map((c) => [c.id, conversationTitle(c, c.members, meId)]));
  const nameOf = (id: string | null) => (id ? people.get(id)?.username ?? "Someone" : "Someone");

  return (
    <ul className="overflow-hidden rounded-lg border border-border bg-surface">
      {items.map((item) => {
        const where = titles.get(item.room_id);
        const snippet =
          plainText(item.messages?.content ?? "") ||
          (item.messages?.attachments?.[0] ? `📎 ${item.messages.attachments[0].name}` : "");
        const href = item.message_id ? `/chat/${item.room_id}?m=${item.message_id}` : `/chat/${item.room_id}`;
        return (
          <li key={item.id} className="border-b border-border last:border-0">
            <Link
              href={href}
              className={`flex gap-3 px-4 py-3 transition hover:bg-hover ${
                fresh.has(item.id) ? "bg-mine/50" : ""
              }`}
            >
              {item.actor_id ? (
                <PersonAvatar userId={item.actor_id} />
              ) : (
                <span className="h-8 w-8 shrink-0 rounded-full bg-hover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold">{nameOf(item.actor_id)}</span>{" "}
                  {item.kind === "mention"
                    ? "mentioned you"
                    : item.kind === "reply"
                      ? "replied to you"
                      : `reacted ${item.emoji ?? ""} to your message`}
                  {where && <span className="text-muted"> in {where}</span>}
                </p>
                {snippet && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{snippet}</p>}
              </div>
              <time
                dateTime={item.created_at}
                suppressHydrationWarning
                className="shrink-0 text-xs text-muted"
              >
                {new Date(item.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
              </time>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
