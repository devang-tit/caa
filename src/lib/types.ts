export type RoomKind = "channel" | "direct" | "group";

export type Room = {
  id: string;
  /** Only channels have names; chats are named after their members. */
  name: string | null;
  kind: RoomKind;
  created_by: string | null;
  created_at: string;
};

export type Status = "available" | "busy" | "dnd" | "away";
/** A status as shown on an avatar: what the user picked, or offline. */
export type Presence = Status | "offline";

export type Profile = {
  id: string;
  username: string;
  status: Status;
};

export type Member = { id: string; username: string };

export type Conversation = Room & {
  last_message_at: string | null;
  unread_count: number;
  /** Everyone in a direct/group chat (including you); empty for channels. */
  members: Member[];
};

export type RoomMember = {
  room_id: string;
  user_id: string;
  last_read_at: string;
};

export type Attachment = {
  /** Storage path inside the `attachments` bucket: "<room>/<uuid>/<name>". */
  path: string;
  name: string;
  size: number;
  type: string;
};

export type Message = {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
  reply_to: string | null;
  mentions: string[];
  attachments: Attachment[];
  pinned_at: string | null;
  pinned_by: string | null;
  /** 1:1 chats: when the other person saw it. It disappears DISAPPEAR_AFTER_MS later. */
  seen_at: string | null;
};

/**
 * Seen 1:1 messages are deleted this long after they're seen. Keep in step with
 * delete_seen_messages() in supabase/migrations/20261112020000_disappearing_messages.sql.
 */
export const DISAPPEAR_AFTER_MS = 2 * 60 * 1000;

/** When a message seen at `seenAt` disappears, in epoch milliseconds. */
export const disappearsAt = (seenAt: string) => Date.parse(seenAt) + DISAPPEAR_AFTER_MS;

export type ChatMessage = Message & {
  /** True while an optimistic message is waiting for the database. */
  pending?: boolean;
};

/** Just enough of a message to show a reply quote. */
export type MessagePreview = Pick<Message, "id" | "user_id" | "content" | "attachments">;

export type Reaction = {
  message_id: string;
  user_id: string;
  emoji: string;
};

export type Notification = {
  id: string;
  user_id: string;
  actor_id: string | null;
  kind: "mention" | "reply" | "reaction";
  room_id: string;
  message_id: string | null;
  emoji: string | null;
  created_at: string;
  read_at: string | null;
};

export type CurrentUser = {
  id: string;
  username: string;
  status: Status;
};

export const ROOM_COLUMNS = "id, name, kind, created_by, created_at" as const;

export const MESSAGE_COLUMNS =
  "id, room_id, user_id, content, created_at, edited_at, reply_to, mentions, attachments, pinned_at, pinned_by, seen_at" as const;

/** Messages plus their reactions, for loading a conversation. */
export const MESSAGE_WITH_REACTIONS = `${MESSAGE_COLUMNS}, message_reactions(user_id, emoji)` as const;
export type MessageWithReactions = Message & {
  message_reactions: Omit<Reaction, "message_id">[] | null;
};

/** Split joined rows into messages and a flat reactions list. */
export function splitReactions(rows: MessageWithReactions[]) {
  const reactions: Reaction[] = [];
  const messages: Message[] = rows.map(({ message_reactions, ...message }) => {
    for (const r of message_reactions ?? []) reactions.push({ ...r, message_id: message.id });
    return message;
  });
  return { messages, reactions };
}

/** Activity feed rows (notification + the message it points at). */
export const ACTIVITY_COLUMNS =
  "id, user_id, actor_id, kind, room_id, message_id, emoji, created_at, read_at, messages(content, attachments)";

export type ActivityItem = Notification & {
  messages: { content: string; attachments: Attachment[] } | null;
};

/** Saved messages with enough of the message to list and link to it. */
export const SAVED_COLUMNS =
  "message_id, created_at, messages(id, room_id, user_id, content, attachments, created_at)";

export type SavedItem = {
  message_id: string;
  created_at: string;
  messages: Pick<Message, "id" | "room_id" | "user_id" | "content" | "attachments" | "created_at"> | null;
};

export const STATUS_LABELS: Record<Presence, string> = {
  available: "Available",
  busy: "Busy",
  dnd: "Do not disturb",
  away: "Away",
  offline: "Offline",
};

/** Display name for a conversation from the current user's point of view. */
export function conversationTitle(
  room: Pick<Room, "kind" | "name">,
  members: Member[],
  meId: string,
) {
  if (room.kind === "channel") return room.name ?? "Channel";
  const others = members.filter((m) => m.id !== meId);
  if (others.length === 0) return "Just you";
  return others.map((m) => m.username).join(", ");
}
