-- =============================================================================
-- Migration 0055 – Eigene Wochen- & Team-Challenges (Admin-Editor)
--
-- Vom Superadmin definierte Challenges, die je Woche veröffentlicht werden. Bei
-- Zielerreichung vergibt der Level Hub XP + ein Badge (idempotent). Team-
-- Challenges zählen die Team-Summe der Kennzahl. Reaktivieren = neue Woche mit
-- gleichem badge_key. Zugriff läuft über den Service-Client nach App-Prüfung.
-- =============================================================================

create table if not exists public.custom_challenges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  emoji text not null default '🏆',
  metric text not null,
  target integer not null check (target > 0),
  xp integer not null default 0 check (xp >= 0),
  kind text not null default 'weekly' check (kind in ('weekly', 'team')),
  badge_key text,
  badge_name text,
  badge_emoji text,
  week_start date not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists custom_challenges_org_week_idx
  on public.custom_challenges (organization_id, week_start, active);

alter table public.custom_challenges enable row level security;
