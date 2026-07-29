-- =============================================================================
-- Migration 0056 – Double-XP-Woche (XP-Boost)
--
-- Vom Admin aktivierbarer XP-Boost mit eigenem Titel, Faktor, Zeitraum und
-- optionalem hochgeladenen Banner. Während des aktiven Zeitraums wird die
-- automatische XP (Aufgaben, Pünktlichkeit, Streaks, Challenges) mit dem Faktor
-- multipliziert. Zugriff über Service-Client nach App-Prüfung.
-- =============================================================================

create table if not exists public.xp_boosts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null default 'Double XP',
  factor numeric(4,2) not null default 2.0 check (factor >= 1 and factor <= 10),
  banner_path text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists xp_boosts_org_active_idx
  on public.xp_boosts (organization_id, active, ends_at);

alter table public.xp_boosts enable row level security;
