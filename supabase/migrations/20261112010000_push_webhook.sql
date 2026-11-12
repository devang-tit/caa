-- Calls /api/push when a 1:1 chat message is saved: the same request a
-- Supabase "Database Webhook" would send, set up in SQL so it works whether or
-- not your dashboard shows the Webhooks page. Use this OR a dashboard webhook,
-- not both, or every notification arrives twice.
--
-- Run after 20261112000000_push_notifications.sql. Safe to run again.
--
-- First store the URL and secret in Vault (once; the trigger reads them from
-- there, so the secret is never written into this function):
--   select vault.create_secret('https://<your-site>/api/push', 'push_webhook_url');
--   select vault.create_secret('<PUSH_WEBHOOK_SECRET>', 'push_webhook_secret');
-- To change one later:
--   select vault.update_secret(id, '<new value>') from vault.secrets where name = 'push_webhook_secret';

create extension if not exists pg_net with schema extensions;

create or replace function public.push_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hook_url    text;
  hook_secret text;
begin
  -- Only 1:1 chats notify; skip everything else without an HTTP call.
  if not exists (
    select 1 from public.rooms r where r.id = new.room_id and r.kind = 'direct'
  ) then
    return new;
  end if;

  select decrypted_secret into hook_url
  from vault.decrypted_secrets where name = 'push_webhook_url';
  select decrypted_secret into hook_secret
  from vault.decrypted_secrets where name = 'push_webhook_secret';
  if hook_url is null or hook_secret is null then
    return new; -- not configured yet
  end if;

  -- pg_net queues the request and returns at once; the message insert
  -- never waits for, or fails because of, the notification.
  perform net.http_post(
    url                  := hook_url,
    body                 := jsonb_build_object(
                              'type', 'INSERT',
                              'table', 'messages',
                              'schema', 'public',
                              'record', to_jsonb(new),
                              'old_record', null
                            ),
    headers              := jsonb_build_object(
                              'Content-Type', 'application/json',
                              'x-push-secret', hook_secret
                            ),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  -- Never let notifications break sending messages.
  raise warning 'push_on_message: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists messages_push on public.messages;
create trigger messages_push
  after insert on public.messages
  for each row execute function public.push_on_message();

revoke execute on function public.push_on_message() from public, anon, authenticated;
