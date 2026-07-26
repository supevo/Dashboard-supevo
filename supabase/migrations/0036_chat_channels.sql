-- =============================================================================
-- Migration 0036 – Team messenger (Slack-style channels)
--
-- A proper internal messenger for agency staff: organization-wide channels with
-- a message stream each. Replaces the per-client chat as the place teams talk.
-- Channels are public within the organization (every agency staffer is a member
-- implicitly); clients have no access.
-- =============================================================================

create table if not exists public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  is_archived boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);
create index if not exists chat_channels_org_idx
  on public.chat_channels (organization_id, is_archived, name);

alter table public.chat_channels enable row level security;

create policy chat_channels_select on public.chat_channels
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy chat_channels_insert on public.chat_channels
  for insert with check (
    public.is_agency_staff() and organization_id in (select public.current_user_org_ids())
  );
create policy chat_channels_update on public.chat_channels
  for update using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  )
  with check (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy chat_channels_delete on public.chat_channels
  for delete using (created_by = auth.uid() or public.is_super_admin());

create table if not exists public.chat_channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_channel_messages_channel_idx
  on public.chat_channel_messages (channel_id, created_at);

alter table public.chat_channel_messages enable row level security;

create policy chat_channel_messages_select on public.chat_channel_messages
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy chat_channel_messages_insert on public.chat_channel_messages
  for insert with check (
    author_id = auth.uid()
    and public.is_agency_staff()
    and organization_id in (select public.current_user_org_ids())
  );
create policy chat_channel_messages_delete on public.chat_channel_messages
  for delete using (author_id = auth.uid() or public.is_super_admin());

-- Seed a default "allgemein" channel for every existing organization.
insert into public.chat_channels (organization_id, name, description, created_by)
select id, 'allgemein', 'Allgemeiner Team-Kanal', null
from public.organizations
on conflict (organization_id, name) do nothing;
