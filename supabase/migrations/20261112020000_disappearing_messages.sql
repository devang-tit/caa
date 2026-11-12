-- Disappearing 1:1 messages: once the other person has seen a message, it is
-- deleted for both people, attachments included, 2 minutes later. Group chats
-- and channels are not affected.
--
-- Run after 20261112010000_push_webhook.sql. Safe to run again.
--
-- Only messages sent after this runs disappear; older ones stay. To make the
-- existing 1:1 history disappear too (each message 2 minutes after it is next
-- seen), run:
--   update public.messages m set disappears = true
--   from public.rooms r where r.id = m.room_id and r.kind = 'direct';
--
-- Attachment files are removed through /api/cleanup, using the same Vault
-- entries as the push webhook (push_webhook_url, push_webhook_secret). Without
-- them the messages still disappear, but their files stay in Storage.


-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------
-- When the other person first saw the message; the 2-minute clock starts here.
alter table public.messages
  add column if not exists seen_at timestamptz;

-- Whether the message disappears after it's seen. Existing messages get
-- false; new ones are set by prepare_new_message() below.
alter table public.messages
  add column if not exists disappears boolean not null default false;

create index if not exists messages_seen_at_idx
  on public.messages (seen_at) where seen_at is not null;

-- Clients can only update `content` (column privilege from the first
-- migration), so neither column can be changed from the browser.


-- ---------------------------------------------------------------------
-- 2. New messages: unseen, and disappearing only in 1:1 chats
-- ---------------------------------------------------------------------
create or replace function public.prepare_new_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.pinned_at := null;
  new.pinned_by := null;
  new.edited_at := null;
  new.seen_at := null;
  new.disappears := exists (
    select 1 from public.rooms r where r.id = new.room_id and r.kind = 'direct'
  );
  if new.reply_to is not null and not exists (
    select 1 from public.messages p
    where p.id = new.reply_to and p.room_id = new.room_id
  ) then
    raise exception 'You can only reply to a message in the same conversation';
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. Reading a conversation starts the clock on the other person's messages
-- ---------------------------------------------------------------------
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

  update public.messages m
     set seen_at = now()
   where m.room_id = target
     and m.user_id <> me
     and m.disappears
     and m.seen_at is null;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. Delete seen messages after 2 minutes (checked every 10 seconds).
--    Keep the interval in step with DISAPPEAR_AFTER_MS in src/lib/types.ts.
-- ---------------------------------------------------------------------
create or replace function public.delete_seen_messages()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paths       jsonb;
  hook_url    text;
  hook_secret text;
begin
  -- Reactions, saves and notifications go with the message (on delete
  -- cascade); replies to it keep their text but lose the quote.
  with gone as (
    delete from public.messages
    where seen_at <= now() - interval '2 minutes'
    returning attachments
  )
  select coalesce(jsonb_agg(a.value -> 'path'), '[]'::jsonb) into paths
  from gone cross join lateral jsonb_array_elements(gone.attachments) as a;

  if jsonb_array_length(paths) = 0 then
    return;
  end if;

  -- Storage files can only be removed through the Storage API, so ask the
  -- site to do it. A failure here never undoes the deletes above.
  begin
    select decrypted_secret into hook_url
    from vault.decrypted_secrets where name = 'push_webhook_url';
    select decrypted_secret into hook_secret
    from vault.decrypted_secrets where name = 'push_webhook_secret';
    if hook_url is not null and hook_secret is not null then
      perform net.http_post(
        url                  := regexp_replace(hook_url, '/api/push$', '/api/cleanup'),
        body                 := jsonb_build_object('paths', paths),
        headers              := jsonb_build_object(
                                  'Content-Type', 'application/json',
                                  'x-push-secret', hook_secret
                                ),
        timeout_milliseconds := 5000
      );
    end if;
  exception when others then
    raise warning 'delete_seen_messages: %', sqlerrm;
  end;
end;
$$;

revoke execute on function public.delete_seen_messages() from public, anon, authenticated;

create extension if not exists pg_cron;

-- Scheduling a job under an existing name replaces it.
select cron.schedule('delete-seen-messages', '10 seconds', 'select public.delete_seen_messages()');
