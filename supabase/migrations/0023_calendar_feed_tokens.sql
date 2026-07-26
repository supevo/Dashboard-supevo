-- =============================================================================
-- Migration 0023 – Calendar feed tokens (iCal subscription)
--
-- A secret per-user token that grants read-only access to an .ics feed of the
-- organization's calendar events + approved absences. Used to subscribe from
-- Google/Apple/Outlook. The feed endpoint authenticates by token (no cookie),
-- so the token must stay secret; regenerating it invalidates old URLs.
-- =============================================================================

create table if not exists public.calendar_feed_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token text not null unique
    default replace(gen_random_uuid()::text, '-', '')
         || replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calendar_feed_tokens_token_idx
  on public.calendar_feed_tokens (token);

alter table public.calendar_feed_tokens enable row level security;

-- A user manages only their own feed token.
create policy calendar_feed_tokens_select on public.calendar_feed_tokens
  for select using (user_id = auth.uid() or public.is_super_admin());
create policy calendar_feed_tokens_insert on public.calendar_feed_tokens
  for insert with check (user_id = auth.uid());
create policy calendar_feed_tokens_update on public.calendar_feed_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy calendar_feed_tokens_delete on public.calendar_feed_tokens
  for delete using (user_id = auth.uid() or public.is_super_admin());

create trigger calendar_feed_tokens_set_updated_at
  before update on public.calendar_feed_tokens
  for each row execute function public.set_updated_at();
