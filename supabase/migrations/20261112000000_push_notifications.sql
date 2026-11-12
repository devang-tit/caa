-- Phone notifications (Web Push) for 1:1 chats.
-- Run once in Supabase → SQL Editor, after the two earlier migrations.
-- Safe to run again.
--
-- Flow: the "Phone notifications" switch in the user menu saves this
-- browser's push subscription here. A Database Webhook on messages INSERT
-- calls /api/push, which reads these rows with the secret key and sends the
-- notifications (see README → Phone notifications).

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users see their own push subscriptions" on public.push_subscriptions;
create policy "Users see their own push subscriptions"
  on public.push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users remove their own push subscriptions" on public.push_subscriptions;
create policy "Users remove their own push subscriptions"
  on public.push_subscriptions for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Saving goes through this function: a browser's endpoint is unique, so if
-- someone else signed in on the same browser before, it moves to you.
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in';
  end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 2048 then
    raise exception 'Invalid push endpoint';
  end if;

  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, (select auth.uid()), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id    = excluded.user_id,
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        created_at = now();
end;
$$;

-- Privileges: users read and delete their own rows (RLS above); inserts only
-- through the function. The webhook route uses the secret key (service_role).
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

revoke execute on function public.save_push_subscription(text, text, text)
  from public, anon;
grant execute on function public.save_push_subscription(text, text, text)
  to authenticated;
