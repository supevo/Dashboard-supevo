-- =============================================================================
-- Migration 0032 – Award snapshots + notification types (award, pulse reminder)
--
-- Freezes the monthly award result at month end so the Hall of Fame stays
-- stable even if ratings trickle in later. A monthly cron computes the previous
-- month once and stores the winners + full leaderboard here. Also adds two
-- notification types: 'award' (winner notice) and 'pulse_reminder'.
-- =============================================================================

alter type public.notification_type add value if not exists 'award';
alter type public.notification_type add value if not exists 'pulse_reminder';

create table if not exists public.award_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  month_label text not null,
  overall jsonb,      -- { userId, name, hasAvatar, value }
  quality jsonb,
  reliability jsonb,
  team jsonb,
  rows jsonb not null default '[]'::jsonb, -- full leaderboard (PersonScore[])
  created_at timestamptz not null default now(),
  unique (organization_id, year, month)
);
create index if not exists award_snapshots_org_idx
  on public.award_snapshots (organization_id, year desc, month desc);

alter table public.award_snapshots enable row level security;

-- Agency staff of the org may read snapshots; writing is done by the cron via
-- the service role (which bypasses RLS), so no insert/update policy is exposed.
create policy award_snapshots_select on public.award_snapshots
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
