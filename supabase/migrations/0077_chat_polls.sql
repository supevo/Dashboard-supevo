-- =============================================================================
-- Migration 0077 – Chat-Abstimmungen (Umfragen)
--
-- Agentur-Team kann im Chat Umfragen starten. Eine Umfrage ist eine eigene
-- Nachricht (chat_channel_messages.poll_id) mit Frage + Optionen; Stimmen liegen
-- in chat_poll_votes (eine Zeile je Person+Option, Mehrfachauswahl optional).
-- =============================================================================

create table if not exists public.chat_polls (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  question text not null,
  options text[] not null,
  allow_multiple boolean not null default false,
  closed boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists chat_polls_channel_idx
  on public.chat_polls (channel_id, created_at);

alter table public.chat_polls enable row level security;

create policy chat_polls_select on public.chat_polls
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy chat_polls_insert on public.chat_polls
  for insert with check (
    created_by = auth.uid()
    and public.is_agency_staff()
    and organization_id in (select public.current_user_org_ids())
  );
create policy chat_polls_update on public.chat_polls
  for update using (created_by = auth.uid() or public.is_super_admin())
  with check (created_by = auth.uid() or public.is_super_admin());
create policy chat_polls_delete on public.chat_polls
  for delete using (created_by = auth.uid() or public.is_super_admin());

create table if not exists public.chat_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.chat_polls(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  option_index integer not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, option_index, user_id)
);
create index if not exists chat_poll_votes_poll_idx
  on public.chat_poll_votes (poll_id);

alter table public.chat_poll_votes enable row level security;

create policy chat_poll_votes_select on public.chat_poll_votes
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy chat_poll_votes_insert on public.chat_poll_votes
  for insert with check (
    user_id = auth.uid()
    and public.is_agency_staff()
    and organization_id in (select public.current_user_org_ids())
  );
create policy chat_poll_votes_delete on public.chat_poll_votes
  for delete using (user_id = auth.uid() or public.is_super_admin());

-- A message can carry a poll instead of text/sticker/file.
alter table public.chat_channel_messages
  add column if not exists poll_id uuid references public.chat_polls(id) on delete cascade;
