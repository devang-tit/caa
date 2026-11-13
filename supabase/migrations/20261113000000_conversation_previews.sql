-- Chat list previews
--
-- list_conversations() also returns each conversation's latest message, so
-- the chat list can show "You: See you at 3" under each name:
--
--   last_message = { id, user_id, content, attachments, attachment }
--     content      first 160 characters (markdown; the app strips it)
--     attachments  how many files the message has
--     attachment   { name, type } of the first file, or null
--
-- Optional: until this runs, the app shows member names or status instead
-- of a preview. Safe to run more than once.
--
-- Adding an output column changes the function's return type, which
-- "create or replace" can't do, so it is dropped and recreated (with its
-- grants) in one transaction: callers never see it missing.

begin;

drop function if exists public.list_conversations();

create function public.list_conversations()
returns table (
  id uuid,
  kind text,
  name text,
  created_by uuid,
  created_at timestamptz,
  last_message_at timestamptz,
  unread_count integer,
  members jsonb,
  last_message jsonb
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
    lm.created_at,
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
    end,
    case
      when lm.id is null then null
      else jsonb_build_object(
        'id', lm.id,
        'user_id', lm.user_id,
        'content', left(lm.content, 160),
        'attachments', jsonb_array_length(lm.attachments),
        'attachment', case
          when jsonb_array_length(lm.attachments) > 0 then jsonb_build_object(
            'name', lm.attachments -> 0 ->> 'name',
            'type', lm.attachments -> 0 ->> 'type'
          )
        end
      )
    end
  from visible v
  -- Newest message per room; uses messages_room_id_created_at_idx.
  left join lateral (
    select msg.id, msg.user_id, msg.content, msg.attachments, msg.created_at
    from public.messages msg
    where msg.room_id = v.id
    order by msg.created_at desc
    limit 1
  ) lm on true
  order by v.created_at;
$$;

revoke execute on function public.list_conversations() from public, anon;
grant execute on function public.list_conversations() to authenticated;

commit;
