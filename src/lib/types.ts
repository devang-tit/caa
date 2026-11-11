export type Room = {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
};

export type Message = {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
};

export type ChatMessage = Message & {
  username: string;
  /** True while an optimistic message is waiting for the database. */
  pending?: boolean;
};

export type CurrentUser = {
  id: string;
  username: string;
};

export const MESSAGE_COLUMNS =
  "id, room_id, user_id, content, created_at, edited_at" as const;
