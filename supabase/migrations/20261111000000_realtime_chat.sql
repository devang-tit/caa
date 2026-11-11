-- =====================================================================
-- Realtime chat schema
--
-- Run this once in Supabase Dashboard → SQL Editor → New query → Run
-- (or with the Supabase CLI: `supabase db push`). It is safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Profiles: one row per auth user, created automatically on sign-up
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null check (char_length(username) between 1 and 32),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are visible to signed-in users" on public.profiles;
create policy "Profiles are visible to signed-in users"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
        split_part(new.email, '@', 1),
        'user'
      ),
      32
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that signed up before this migration ran.
insert into public.profiles (id, username)
select
  id,
  left(
    coalesce(
      nullif(trim(raw_user_meta_data ->> 'username'), ''),
      split_part(email, '@', 1),
      'user'
    ),
    32
  )
from auth.users
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 2. Rooms
-- ---------------------------------------------------------------------
create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(trim(name)) between 1 and 50),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

drop policy if exists "Rooms are visible to signed-in users" on public.rooms;
create policy "Rooms are visible to signed-in users"
  on public.rooms for select to authenticated
  using (true);

drop policy if exists "Signed-in users can create rooms" on public.rooms;
create policy "Signed-in users can create rooms"
  on public.rooms for insert to authenticated
  with check ((select auth.uid()) = created_by);


-- ---------------------------------------------------------------------
-- 3. Messages
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  content    text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);

create index if not exists messages_room_id_created_at_idx
  on public.messages (room_id, created_at desc);

alter table public.messages enable row level security;

drop policy if exists "Messages are visible to signed-in users" on public.messages;
create policy "Messages are visible to signed-in users"
  on public.messages for select to authenticated
  using (true);

drop policy if exists "Users can send messages as themselves" on public.messages;
create policy "Users can send messages as themselves"
  on public.messages for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can edit their own messages" on public.messages;
create policy "Users can edit their own messages"
  on public.messages for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own messages" on public.messages;
create policy "Users can delete their own messages"
  on public.messages for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Stamp edited_at whenever the content changes.
create or replace function public.set_message_edited_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.content is distinct from old.content then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists messages_set_edited_at on public.messages;
create trigger messages_set_edited_at
  before update on public.messages
  for each row execute function public.set_message_edited_at();


-- ---------------------------------------------------------------------
-- 4. Table privileges (RLS above decides *which rows*; these decide
--    *which operations / columns*). Anonymous visitors get nothing, and
--    users can only change a message's content, never its room or author.
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.rooms, public.messages from anon, authenticated;

grant select                  on public.profiles to authenticated;
grant update (username)       on public.profiles to authenticated;

grant select, insert          on public.rooms    to authenticated;

grant select, insert, delete  on public.messages to authenticated;
grant update (content)        on public.messages to authenticated;


-- ---------------------------------------------------------------------
-- 5. Realtime: stream row changes for rooms and messages
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. Seed a default room
-- ---------------------------------------------------------------------
insert into public.rooms (name, created_by)
values ('general', null)
on conflict (name) do nothing;
