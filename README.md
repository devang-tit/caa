# Realtime Chat — Next.js 16 + Supabase

A multi-room chat app where messages, edits, deletes, new rooms, online users and
"is typing…" indicators update live for everyone.

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

## Setup

### 1. Create a Supabase project

Create one at [supabase.com/dashboard](https://supabase.com/dashboard).

### 2. Create the database schema

Open **SQL Editor → New query**, paste the contents of
[`supabase/migrations/20261111000000_realtime_chat.sql`](supabase/migrations/20261111000000_realtime_chat.sql)
and click **Run**. It creates the `profiles`, `rooms` and `messages` tables, the RLS
policies and triggers, adds the tables to the Realtime publication, and seeds a
`general` room. It's safe to run again.

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
├── components/avatar.tsx
└── app/
    ├── login/                    # sign in / sign up (Server Action + useActionState)
    ├── auth/confirm/route.ts     # email-link landing (PKCE code or token_hash)
    └── chat/
        ├── layout.tsx            # static shell + streamed sidebar
        ├── rooms-sidebar.tsx     # live room list, create room, sign out
        ├── page.tsx              # "pick a room" empty state
        └── [roomId]/
            ├── page.tsx          # loads room + last 50 messages on the server
            └── chat-room.tsx     # realtime messages, presence, typing, edit/delete
supabase/migrations/              # database schema
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
