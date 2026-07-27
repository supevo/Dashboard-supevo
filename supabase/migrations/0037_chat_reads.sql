-- =============================================================================
-- Migration 0037 – Chat read state (unread markers)
--
-- Tracks the last time each user read a channel, so the messenger can show
-- unread badges. Mentions reuse the existing 'comment_mention' notification
-- type, so no enum change is needed here.
-- =============================================================================

create table if not exists public.chat_reads (
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

alter table public.chat_reads enable row level security;

-- A user only ever manages their own read markers.
create policy chat_reads_select on public.chat_reads
  for select using (user_id = auth.uid() or public.is_super_admin());
create policy chat_reads_insert on public.chat_reads
  for insert with check (user_id = auth.uid());
create policy chat_reads_update on public.chat_reads
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Unread message counts per channel for the calling user (own messages and
-- already-read messages excluded). SECURITY INVOKER so message RLS still applies.
create or replace function public.chat_unread_counts()
returns table(channel_id uuid, unread bigint)
language sql
stable
security invoker
as $$
  select m.channel_id, count(*)::bigint
  from public.chat_channel_messages m
  left join public.chat_reads r
    on r.channel_id = m.channel_id and r.user_id = auth.uid()
  where m.author_id is distinct from auth.uid()
    and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
  group by m.channel_id;
$$;
