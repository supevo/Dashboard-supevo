-- =============================================================================
-- Migration 0038 – Direct messages (1:1) + private channels
--
-- Extends the messenger with two access-controlled conversation kinds:
--   * private channels (is_private = true) – visible only to their members
--   * direct messages  (kind = 'dm')       – a private 1:1 channel, keyed by
--                                             the sorted participant pair
-- Public channels keep working as before (visible to all agency staff of org).
-- Access is centralized in can_access_chat_channel() so message + channel RLS
-- share one definition and private content never leaks.
-- =============================================================================

alter table public.chat_channels
  add column if not exists kind text not null default 'channel',
  add column if not exists is_private boolean not null default false,
  add column if not exists dm_key text;

-- The old unique(organization_id, name) blocked empty DM names; replace it with
-- a partial unique index that only applies to real channels.
alter table public.chat_channels
  drop constraint if exists chat_channels_organization_id_name_key;
create unique index if not exists chat_channels_name_key
  on public.chat_channels (organization_id, lower(name))
  where kind = 'channel';
create unique index if not exists chat_channels_dm_key_idx
  on public.chat_channels (dm_key)
  where dm_key is not null;

-- Members of a private channel / DM. Public channels use no rows (implicit).
create table if not exists public.chat_channel_members (
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists chat_channel_members_user_idx
  on public.chat_channel_members (user_id);

alter table public.chat_channel_members enable row level security;

-- Org staff may read membership (needed to render participants); writes happen
-- via the service role in server actions after authorization.
create policy chat_channel_members_select on public.chat_channel_members
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

-- Central access check: agency staff of the org, and for private channels/DMs
-- only actual members. SECURITY DEFINER so it bypasses RLS internally (no leak,
-- no recursion with the policies that call it).
create or replace function public.can_access_chat_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_channels c
    where c.id = p_channel_id
      and public.is_agency_staff()
      and c.organization_id in (select public.current_user_org_ids())
      and (
        c.is_private = false
        or exists (
          select 1 from public.chat_channel_members m
          where m.channel_id = c.id and m.user_id = auth.uid()
        )
      )
  );
$$;
grant execute on function public.can_access_chat_channel(uuid) to authenticated;

-- Re-scope channel + message visibility through the access check.
drop policy if exists chat_channels_select on public.chat_channels;
create policy chat_channels_select on public.chat_channels
  for select using (
    public.can_access_chat_channel(id) or public.is_super_admin()
  );

drop policy if exists chat_channel_messages_select on public.chat_channel_messages;
create policy chat_channel_messages_select on public.chat_channel_messages
  for select using (
    public.can_access_chat_channel(channel_id) or public.is_super_admin()
  );

drop policy if exists chat_channel_messages_insert on public.chat_channel_messages;
create policy chat_channel_messages_insert on public.chat_channel_messages
  for insert with check (
    author_id = auth.uid()
    and (public.can_access_chat_channel(channel_id) or public.is_super_admin())
  );
