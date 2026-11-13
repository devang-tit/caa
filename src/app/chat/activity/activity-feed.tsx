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
import { EmptyList, LIST_CLASS, ROW_DIVIDER } from "../page-shell";

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
    <ul className={LIST_CLASS}>
      {items.map((item) => {
        const where = titles.get(item.room_id);
        const snippet =
          plainText(item.messages?.content ?? "") ||
          (item.messages?.attachments?.[0] ? `📎 ${item.messages.attachments[0].name}` : "");
        const href = item.message_id ? `/chat/${item.room_id}?m=${item.message_id}` : `/chat/${item.room_id}`;
        const isNew = fresh.has(item.id);
        return (
          <li key={item.id} className="group/row">
            <Link
              href={href}
              className={`relative flex gap-3 pl-4 transition hover:bg-hover active:bg-hover md:pr-4 ${
                isNew ? "bg-accent-soft/50" : ""
              }`}
            >
              {isNew && (
                <span aria-label="New" className="absolute top-1/2 left-1.5 h-2 w-2 -translate-y-1/2 rounded-full bg-accent" />
              )}
              <span className="relative mt-3 self-start">
                {item.actor_id ? (
                  <PersonAvatar userId={item.actor_id} size="lg" showStatus={false} />
                ) : (
                  <span className="block h-10 w-10 rounded-full bg-hover" />
                )}
                <span
                  aria-hidden
                  className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface text-[11px] shadow-soft ring-2 ring-[color:var(--avatar-ring,var(--surface))]"
                >
                  {item.kind === "mention" ? "@" : item.kind === "reply" ? "↩" : (item.emoji ?? "♥")}
                </span>
              </span>
              <div className={`min-w-0 flex-1 py-3 pr-4 md:pr-0 ${ROW_DIVIDER}`}>
                <div className="flex items-baseline gap-2">
                  <p className="min-w-0 flex-1 text-[15px] leading-snug sm:text-sm">
                    <span className="font-semibold">{nameOf(item.actor_id)}</span>{" "}
                    {item.kind === "mention"
                      ? "mentioned you"
                      : item.kind === "reply"
                        ? "replied to you"
                        : `reacted ${item.emoji ?? ""} to your message`}
                    {where && <span className="text-muted"> in {where}</span>}
                  </p>
                  <time
                    dateTime={item.created_at}
                    suppressHydrationWarning
                    className="shrink-0 text-xs text-muted"
                  >
                    {new Date(item.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </time>
                </div>
                {snippet && (
                  <p className="mt-1 line-clamp-2 rounded-lg border-l-2 border-accent-text/50 bg-background/80 px-2.5 py-1 text-sm text-muted md:bg-hover/60">
                    {snippet}
                  </p>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
