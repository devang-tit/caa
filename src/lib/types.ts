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

/** The newest message in a conversation, for the chat list preview. */
export type LastMessage = {
  id: string;
  user_id: string;
  /** First 160 characters, markdown. */
  content: string;
  /** How many files it has, and the first one. */
  attachments: number;
  attachment: Pick<Attachment, "name" | "type"> | null;
};

export type Conversation = Room & {
  last_message_at: string | null;
  unread_count: number;
  /** Everyone in a direct/group chat (including you); empty for channels. */
  members: Member[];
  /**
   * Missing until 20261113000000_conversation_previews.sql has run; null when
   * there are no messages yet.
   */
  last_message?: LastMessage | null;
};

/** The chat list preview for a message that just arrived. */
export function toLastMessage(message: Pick<Message, "id" | "user_id" | "content" | "attachments">): LastMessage {
  const first = message.attachments[0];
  return {
    id: message.id,
    user_id: message.user_id,
    content: message.content.slice(0, 160),
    attachments: message.attachments.length,
    attachment: first ? { name: first.name, type: first.type } : null,
  };
}

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
  /** Image size in pixels, so the chat can reserve its space before it loads. */
  width?: number;
  height?: number;
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
  /**
   * 1:1 chats: when the other person saw it. It disappears DISAPPEAR_AFTER_MS
   * later. Missing until 20261112020000_disappearing_messages.sql has run.
   */
  seen_at?: string | null;
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

// "*" rather than a column list: columns added by later migrations (such as
// seen_at) come through once they exist, and the app keeps working before
// they're applied, so a deploy never has to wait for the database.
export const MESSAGE_COLUMNS = "*" as const;

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
