-- =====================================================================
-- Teams-style features
--
--   • Direct (1:1) and group chats alongside public channels
--   • Replies, reactions, @mentions and an Activity feed
--   • File & image attachments (Supabase Storage)
--   • Presence status (Available / Busy / Do not disturb / Away)
--   • Read receipts and unread counts
--   • Pinned and saved messages, fast message search
--
-- Run AFTER 20261111000000_realtime_chat.sql, in Supabase Dashboard →
-- SQL Editor → New query → Run. It is safe to re-run. If you ever re-run
-- the earlier file, run this one again afterwards: the earlier file resets
-- policies and grants that this one tightens.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;


-- ---------------------------------------------------------------------
-- 1. Profiles: presence status
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists status text not null default 'available';

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check
  check (status in ('available', 'busy', 'dnd', 'away'));

grant update (username, status) on public.profiles to authenticated;


-- ---------------------------------------------------------------------
-- 2. Conversations: a room is a public channel, a 1:1 chat or a group
-- ---------------------------------------------------------------------
alter table public.rooms add column if not exists kind text not null default 'channel';
alter table public.rooms drop constraint if exists rooms_kind_check;
alter table public.rooms
  add constraint rooms_kind_check check (kind in ('channel', 'direct', 'group'));

-- Chats are named after their members, so only channels need a name.
-- (The existing UNIQUE on name still applies; NULLs never collide.)
alter table public.rooms alter column name drop not null;
alter table public.rooms drop constraint if exists rooms_channel_name_check;
alter table public.rooms
  add constraint rooms_channel_name_check check (kind <> 'channel' or name is not null);

-- "<smaller user id>:<larger user id>" so each pair has one 1:1 chat.
alter table public.rooms add column if not exists dm_key text unique;


-- ---------------------------------------------------------------------
-- 3. Membership + read state
--    Private chats: a row per member grants access.
--    Channels: rows are created lazily and only track what you've read.
-- ---------------------------------------------------------------------
create table if not exists public.room_members (
  room_id      uuid not null references public.rooms (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  joined_at    timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists room_members_user_id_idx on public.room_members (user_id);

alter table public.room_members enable row level security;

-- Channels start "read" for existing users so nobody gets a flood of
-- unread badges the first time this runs.
insert into public.room_members (room_id, user_id)
select r.id, p.id
from public.rooms r cross join public.profiles p
where r.kind = 'channel'
on conflict do nothing;


-- ---------------------------------------------------------------------
-- 4. Access helper used by every policy below
--    SECURITY DEFINER so policies on rooms/room_members don't recurse.
-- ---------------------------------------------------------------------
create or replace function public.can_access_room(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rooms r
    where r.id = target
      and (
        r.kind = 'channel'
        or exists (
          select 1 from public.room_members m
          where m.room_id = r.id and m.user_id = (select auth.uid())
        )
      )
  );
$$;

-- Storage object names look like "<room id>/<uuid>/<file name>".
create or replace function public.can_access_storage_path(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folder text := split_part(object_name, '/', 1);
begin
  if folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.can_access_room(folder::uuid);
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Rooms & messages: restrict private chats to their members
-- ---------------------------------------------------------------------
drop policy if exists "Rooms are visible to signed-in users" on public.rooms;
drop policy if exists "Channels and your chats are visible" on public.rooms;
-- Channels are checked inline (not via the helper) so `insert … returning`
-- works: the helper can't see a row inserted by the same statement.
create policy "Channels and your chats are visible"
  on public.rooms for select to authenticated
  using (kind = 'channel' or public.can_access_room(id));

-- Chats are created through start_conversation(); clients insert channels only.
drop policy if exists "Signed-in users can create rooms" on public.rooms;
drop policy if exists "Signed-in users can create channels" on public.rooms;
create policy "Signed-in users can create channels"
  on public.rooms for insert to authenticated
  with check ((select auth.uid()) = created_by and kind = 'channel' and dm_key is null);

drop policy if exists "Messages are visible to signed-in users" on public.messages;
drop policy if exists "Messages are visible to room members" on public.messages;
create policy "Messages are visible to room members"
  on public.messages for select to authenticated
  using (public.can_access_room(room_id));

drop policy if exists "Users can send messages as themselves" on public.messages;
create policy "Users can send messages as themselves"
  on public.messages for insert to authenticated
  with check ((select auth.uid()) = user_id and public.can_access_room(room_id));

drop policy if exists "Members are visible to people in the room" on public.room_members;
create policy "Members are visible to people in the room"
  on public.room_members for select to authenticated
  using (public.can_access_room(room_id));


-- ---------------------------------------------------------------------
-- 6. Messages: replies, mentions, attachments, pins
-- ---------------------------------------------------------------------
alter table public.messages
  add column if not exists reply_to uuid references public.messages (id) on delete set null;
alter table public.messages
  add column if not exists mentions uuid[] not null default '{}';
alter table public.messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.messages
  add column if not exists pinned_at timestamptz;
alter table public.messages
  add column if not exists pinned_by uuid references public.profiles (id) on delete set null;

-- A message needs text, attachments, or both.
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages
  add constraint messages_body_check check (
    char_length(trim(content)) <= 2000
    and (char_length(trim(content)) >= 1 or jsonb_array_length(attachments) > 0)
  );

alter table public.messages drop constraint if exists messages_attachments_check;
alter table public.messages
  add constraint messages_attachments_check check (
    jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10
  );

alter table public.messages drop constraint if exists messages_mentions_check;
alter table public.messages
  add constraint messages_mentions_check check (cardinality(mentions) <= 50);

create index if not exists messages_reply_to_idx on public.messages (reply_to);
create index if not exists messages_pinned_idx
  on public.messages (room_id, pinned_at desc) where pinned_at is not null;
create index if not exists messages_content_trgm_idx
  on public.messages using gin (content extensions.gin_trgm_ops);

-- New messages can't arrive pre-pinned or pre-edited, and replies must
-- stay inside the same conversation.
create or replace function public.prepare_new_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.pinned_at := null;
  new.pinned_by := null;
  new.edited_at := null;
  if new.reply_to is not null and not exists (
    select 1 from public.messages p
    where p.id = new.reply_to and p.room_id = new.room_id
  ) then
    raise exception 'You can only reply to a message in the same conversation';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_prepare_new on public.messages;
create trigger messages_prepare_new
  before insert on public.messages
  for each row execute function public.prepare_new_message();


-- ---------------------------------------------------------------------
-- 7. Reactions
-- ---------------------------------------------------------------------
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists message_reactions_room_id_idx on public.message_reactions (room_id);

alter table public.message_reactions enable row level security;

-- room_id is copied from the message (never trusted from the client) so
-- realtime can filter by room. Runs as the caller, so RLS hides messages
-- from conversations you aren't in.
create or replace function public.set_reaction_room()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select m.room_id into new.room_id from public.messages m where m.id = new.message_id;
  if new.room_id is null then
    raise exception 'Message not found';
  end if;
  return new;
end;
$$;

drop trigger if exists message_reactions_set_room on public.message_reactions;
create trigger message_reactions_set_room
  before insert on public.message_reactions
  for each row execute function public.set_reaction_room();

drop policy if exists "Reactions are visible to room members" on public.message_reactions;
create policy "Reactions are visible to room members"
  on public.message_reactions for select to authenticated
  using (public.can_access_room(room_id));

drop policy if exists "Users can react as themselves" on public.message_reactions;
create policy "Users can react as themselves"
  on public.message_reactions for insert to authenticated
  with check ((select auth.uid()) = user_id and public.can_access_room(room_id));

drop policy if exists "Users can remove their own reactions" on public.message_reactions;
create policy "Users can remove their own reactions"
  on public.message_reactions for delete to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------
-- 8. Saved messages (private bookmarks)
-- ---------------------------------------------------------------------
create table if not exists public.saved_messages (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

alter table public.saved_messages enable row level security;

drop policy if exists "Users see their own saved messages" on public.saved_messages;
create policy "Users see their own saved messages"
  on public.saved_messages for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can save messages they can see" on public.saved_messages;
create policy "Users can save messages they can see"
  on public.saved_messages for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.messages m where m.id = message_id)
  );

drop policy if exists "Users can unsave their messages" on public.saved_messages;
create policy "Users can unsave their messages"
  on public.saved_messages for delete to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------
-- 9. Activity feed: mentions, replies and reactions to your messages
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('mention', 'reply', 'reaction')),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  emoji      text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Users see their own activity" on public.notifications;
create policy "Users see their own activity"
  on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can mark their activity read" on public.notifications;
create policy "Users can mark their activity read"
  on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_author uuid;
begin
  -- Mentions: only people who can see the conversation, never yourself.
  insert into public.notifications (user_id, actor_id, kind, room_id, message_id)
  select distinct p.id, new.user_id, 'mention', new.room_id, new.id
  from public.profiles p
  join public.rooms r on r.id = new.room_id
  where p.id = any (new.mentions)
    and p.id <> new.user_id
    and (
      r.kind = 'channel'
      or exists (
        select 1 from public.room_members m
        where m.room_id = r.id and m.user_id = p.id
      )
    );

  -- Replies notify the original author (unless they were already mentioned).
  if new.reply_to is not null then
    select m.user_id into parent_author from public.messages m where m.id = new.reply_to;
    if parent_author is not null
       and parent_author <> new.user_id
       and not (parent_author = any (new.mentions)) then
      insert into public.notifications (user_id, actor_id, kind, room_id, message_id)
      values (parent_author, new.user_id, 'reply', new.room_id, new.id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_on_message();

create or replace function public.notify_on_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
begin
  select m.user_id into author from public.messages m where m.id = new.message_id;
  if author is not null and author <> new.user_id then
    insert into public.notifications (user_id, actor_id, kind, room_id, message_id, emoji)
    values (author, new.user_id, 'reaction', new.room_id, new.message_id, new.emoji);
  end if;
  return new;
end;
$$;

drop trigger if exists message_reactions_notify on public.message_reactions;
create trigger message_reactions_notify
  after insert on public.message_reactions
  for each row execute function public.notify_on_reaction();


-- ---------------------------------------------------------------------
-- 10. RPCs the app calls
-- ---------------------------------------------------------------------

-- Open (or reuse) a 1:1 chat, or create a group chat. Returns the room id.
create or replace function public.start_conversation(member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  others uuid[];
  pair_key text;
  conversation uuid;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  select coalesce(array_agg(distinct p.id), '{}') into others
  from public.profiles p
  where p.id = any (member_ids) and p.id <> me;

  if cardinality(others) = 0 then
    raise exception 'Pick at least one other person';
  end if;
  if cardinality(others) > 49 then
    raise exception 'Group chats can have up to 50 people';
  end if;

  if cardinality(others) = 1 then
    pair_key := least(me::text, others[1]::text) || ':' || greatest(me::text, others[1]::text);
    select r.id into conversation from public.rooms r where r.dm_key = pair_key;
    if conversation is not null then
      return conversation;
    end if;

    insert into public.rooms (kind, created_by, dm_key)
    values ('direct', me, pair_key)
    on conflict (dm_key) do nothing
    returning id into conversation;

    -- Someone else created it at the same moment.
    if conversation is null then
      select r.id into conversation from public.rooms r where r.dm_key = pair_key;
      return conversation;
    end if;
  else
    insert into public.rooms (kind, created_by)
    values ('group', me)
    returning id into conversation;
  end if;

  insert into public.room_members (room_id, user_id)
  select conversation, u from unnest(others || me) as u
  on conflict do nothing;

  return conversation;
end;
$$;

-- Mark everything in a conversation as read for the current user.
create or replace function public.mark_room_read(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or not public.can_access_room(target) then
    return;
  end if;
  insert into public.room_members (room_id, user_id, last_read_at)
  values (target, me, now())
  on conflict (room_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

-- Anyone in a conversation can pin or unpin any of its messages.
create or replace function public.toggle_pin(target uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room uuid;
  result timestamptz;
begin
  select m.room_id into target_room from public.messages m where m.id = target;
  if target_room is null or not public.can_access_room(target_room) then
    raise exception 'Message not found';
  end if;

  update public.messages
     set pinned_at = case when pinned_at is null then now() else null end,
         pinned_by = case when pinned_at is null then (select auth.uid()) else null end
   where id = target
  returning pinned_at into result;

  return result;
end;
$$;

-- Everything the sidebar needs in one round-trip.
create or replace function public.list_conversations()
returns table (
  id uuid,
  kind text,
  name text,
  created_by uuid,
  created_at timestamptz,
  last_message_at timestamptz,
  unread_count integer,
  members jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id
  ),
  visible as (
    select r.*
    from public.rooms r, me
    where r.kind = 'channel'
       or exists (
         select 1 from public.room_members m
         where m.room_id = r.id and m.user_id = me.id
       )
  )
  select
    v.id,
    v.kind,
    v.name,
    v.created_by,
    v.created_at,
    (select max(msg.created_at) from public.messages msg where msg.room_id = v.id),
    (
      select count(*)::integer
      from public.messages msg, me
      where msg.room_id = v.id
        and msg.user_id <> me.id
        and msg.created_at > coalesce(
          (select rm.last_read_at from public.room_members rm
            where rm.room_id = v.id and rm.user_id = me.id),
          (select p.created_at from public.profiles p where p.id = me.id)
        )
    ),
    case
      when v.kind = 'channel' then '[]'::jsonb
      else (
        select coalesce(
          jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username) order by p.username),
          '[]'::jsonb
        )
        from public.room_members rm
        join public.profiles p on p.id = rm.user_id
        where rm.room_id = v.id
      )
    end
  from visible v
  order by v.created_at;
$$;


-- ---------------------------------------------------------------------
-- 11. Privileges. Supabase grants everything on new tables and functions
--     by default; RLS decides rows, these decide operations & columns.
-- ---------------------------------------------------------------------
revoke all on public.room_members, public.message_reactions,
              public.saved_messages, public.notifications
  from anon, authenticated;

grant select                       on public.room_members      to authenticated;
grant select, delete               on public.message_reactions to authenticated;
grant insert (message_id, emoji)   on public.message_reactions to authenticated;
grant select, delete               on public.saved_messages    to authenticated;
grant insert (message_id)          on public.saved_messages    to authenticated;
grant select                       on public.notifications     to authenticated;
grant update (read_at)             on public.notifications     to authenticated;

revoke execute on function
  public.can_access_room(uuid),
  public.can_access_storage_path(text),
  public.start_conversation(uuid[]),
  public.mark_room_read(uuid),
  public.toggle_pin(uuid),
  public.list_conversations()
  from public, anon;

grant execute on function
  public.can_access_room(uuid),
  public.can_access_storage_path(text),
  public.start_conversation(uuid[]),
  public.mark_room_read(uuid),
  public.toggle_pin(uuid),
  public.list_conversations()
  to authenticated;

revoke execute on function
  public.prepare_new_message(),
  public.set_reaction_room(),
  public.notify_on_message(),
  public.notify_on_reaction()
  from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 12. Realtime: stream the new tables too
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'room_members', 'message_reactions', 'notifications']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 13. Attachments bucket (private; members of a conversation can read)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)  -- 25 MB per file
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "Members can read chat attachments" on storage.objects;
create policy "Members can read chat attachments"
  on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.can_access_storage_path(name));

drop policy if exists "Members can upload chat attachments" on storage.objects;
create policy "Members can upload chat attachments"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_access_storage_path(name));

drop policy if exists "Uploaders can delete their attachments" on storage.objects;
create policy "Uploaders can delete their attachments"
  on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and owner_id = (select auth.uid())::text);
