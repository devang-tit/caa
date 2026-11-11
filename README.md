# Realtime Chat — Next.js 16 + Supabase

A Teams-style chat app: public channels, 1:1 and group chats, replies, reactions,
@mentions with an Activity feed, file sharing, presence status, read receipts,
pinned and saved messages, and search — all updating live for everyone.

**Stack:** Next.js 16.4 (App Router, Cache Components, Turbopack) · React 19.3 ·
Tailwind CSS 4 · `@supabase/supabase-js` 2.119 · `@supabase/ssr` 0.12

## Features

| Feature | How it works |
| --- | --- |
| Email + password auth | Server Actions + `@supabase/ssr` cookies, session refreshed in `src/proxy.ts` |
| Rooms | Create rooms; new rooms appear in everyone's sidebar instantly (Postgres Changes) |
| Live messages | `INSERT` / `UPDATE` / `DELETE` on `messages` streamed via Supabase Realtime |
| Edit / delete own messages | Enforced by RLS and column privileges in Postgres, not just the UI |
| Who's online | Realtime **Presence** on the room channel |
| Typing indicator | Realtime **Broadcast** (ephemeral, never stored) |
| Optimistic sending | Message shows immediately, then swaps for the saved row (deduped by id) |
| Channels, 1:1 and group chats | `rooms.kind`; private chats are visible only to rows in `room_members` (RLS). `start_conversation()` reuses an existing 1:1 chat |
| Replies & reactions | `messages.reply_to` (same conversation only) and `message_reactions`, streamed per room |
| @mentions & Activity | `messages.mentions`; triggers write `notifications` for mentions, replies and reactions to your messages |
| Files & images | Private `attachments` Storage bucket (25 MB/file); only people in the conversation can read them, via signed URLs |
| Status & read receipts | `profiles.status` (Available/Busy/Do not disturb/Away) + a global Presence channel; `room_members.last_read_at` drives "Seen" and unread badges |
| Pin & save | `toggle_pin()` for anyone in the conversation; `saved_messages` is private per user |
| Formatting & emoji | Safe Markdown subset (bold, italic, strike, code, links, lists, quotes) rendered as React elements, plus an emoji picker |
| Search | Top bar searches chats and message text (`pg_trgm` index); results jump to the message in context |

## Setup

### 1. Create a Supabase project

Create one at [supabase.com/dashboard](https://supabase.com/dashboard).

### 2. Create the database schema

Open **SQL Editor → New query** and run each file in
[`supabase/migrations/`](supabase/migrations/) **in order**:

1. [`20261111000000_realtime_chat.sql`](supabase/migrations/20261111000000_realtime_chat.sql)
   — `profiles`, `rooms`, `messages`, RLS, Realtime, and a seeded `general` channel.
2. [`20261111120000_teams_features.sql`](supabase/migrations/20261111120000_teams_features.sql)
   — chats & membership, reactions, replies, mentions, notifications, status, pins,
   saved messages, the search index and the private `attachments` Storage bucket.

Both are safe to run again. If you re-run the first one, re-run the second one after
it: the first resets policies and grants that the second tightens.

### 3. Configure auth

In **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** add `http://localhost:3000/auth/confirm`

Supabase requires email confirmation by default. For quick local testing you can
turn it off under **Authentication → Sign In / Providers → Email → Confirm email**.
With it on, users get a confirmation link that lands on `/auth/confirm`.

### 4. Add your keys

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from
**Project Settings → API Keys** (the legacy `anon` key works too).

### 5. Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000> in two different browsers (or one normal and one
private window), sign up as two users, and chat between them.

## Project structure

```
src/
├── proxy.ts                      # Next 16 "proxy" (formerly middleware): session refresh + route guard
├── lib/
│   ├── types.ts
│   └── supabase/
│       ├── client.ts             # browser client (Client Components)
│       ├── server.ts             # server client + getCurrentUser()
│       ├── proxy.ts              # updateSession() used by src/proxy.ts
│       └── realtime.ts           # subscribeToChannel(): Strict-Mode-safe channel lifecycle
│   ├── rich-text.tsx             # safe Markdown subset → React elements
│   └── emoji.ts
├── components/
│   ├── session-provider.tsx      # me / people / conversations promises + live status & presence
│   ├── avatar.tsx, person-avatar.tsx, icons.tsx
└── app/
    ├── login/                    # sign in / sign up (Server Action + useActionState)
    ├── auth/confirm/route.ts     # email-link landing (PKCE code or token_hash)
    └── chat/
        ├── layout.tsx            # static shell; session data streams in behind <Suspense>
        ├── app-nav.tsx           # Activity / Chat / Saved rail (bottom bar on phones)
        ├── rooms-sidebar.tsx     # chats + channels, unread badges, new channel
        ├── new-chat-dialog.tsx   # people picker → 1:1 or group chat
        ├── room-search.tsx       # search chats and messages
        ├── user-menu.tsx         # status + sign out
        ├── activity/             # mentions, replies, reactions
        ├── saved/                # saved messages
        └── [roomId]/
            ├── page.tsx          # messages, reactions, members, pins; ?m=<id> jumps to a message
            ├── chat-room.tsx     # realtime state + actions
            ├── message-item.tsx, message-menu.tsx, room-header.tsx
            ├── composer.tsx      # formatting, emoji, @mentions, attachments, replies
            └── attachments.tsx   # signed-URL images and file cards
supabase/migrations/              # database schema (run in order)
```

## Notes

- **Cache Components is on** (the Next 16 default from `create-next-app`). Anything
  that reads cookies, params or search params sits behind a `<Suspense>` boundary, so
  the page shell is prerendered and the user-specific parts stream in.
- **One Realtime channel per room** carries Postgres Changes, Presence and Broadcast together.
- `supabase.channel(topic)` returns the existing channel while an old one with the same
  topic is still closing. React Strict Mode and Fast Refresh remount effects immediately,
  so `subscribeToChannel()` waits for the old channel to close before creating a new one.
- Postgres `DELETE` events can't be filtered and only include the primary key, so the
  room listens table-wide and drops the id if it has it.
- The people directory (`profiles`) is loaded once per session for avatars, mentions and
  the people picker. That's fine for a team; a very large org would need paging.
- The server Supabase client waits for `connection()`: Partial Prefetching can resolve
  `cookies()` while prerendering a per-session shell, and supabase-js reads the clock on
  start-up, which prerendering doesn't allow.
