-- =============================================================================
-- Migration 0119 – Marketingpläne auf PHASEN umstellen
--
-- Die echten Marketingpläne der Agentur sind phasenbasiert (Phase 1..n), NICHT
-- monatsbasiert – und bewusst ohne festen Zeitraum ("zu Beginn der
-- Zusammenarbeit", "im weiteren Verlauf"). Deshalb:
--
--   * marketing_plans.year wird optional (kein fester Zeitraum mehr), der
--     Jahres-Unique-Index fällt weg. Neu: closing_note (Schlusssatz unter dem
--     Plan).
--   * Neue Tabelle marketing_plan_phases: Titel, vager Zeit-Hinweis, Ergebnis-
--     Satz (die dunkle Box) und Reihenfolge.
--   * marketing_plan_items (die einzelnen Maßnahmen = spätere Kanban-Aufgaben)
--     hängen jetzt an einer Phase statt an einem Monat.
-- =============================================================================

-- --- marketing_plans: Zeitraum offen halten -------------------------------
alter table public.marketing_plans alter column year drop not null;
drop index if exists marketing_plans_client_year_idx;
alter table public.marketing_plans
  add column if not exists closing_note text;

-- --- Phasen ---------------------------------------------------------------
create table if not exists public.marketing_plan_phases (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.marketing_plans(id) on delete cascade,
  title text not null,
  timeframe_hint text,   -- vager Zeit-Hinweis, KEIN Datum
  outcome text,          -- Ergebnis-/Fazit-Satz (dunkle Box)
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_plan_phases_plan_idx
  on public.marketing_plan_phases (plan_id, position);

-- --- Maßnahmen an Phasen hängen ------------------------------------------
alter table public.marketing_plan_items
  add column if not exists phase_id uuid
    references public.marketing_plan_phases(id) on delete cascade;
alter table public.marketing_plan_items alter column month drop not null;

create index if not exists marketing_plan_items_phase_idx
  on public.marketing_plan_items (phase_id, position);

-- --- RLS: Org-Admins Vollzugriff (Service-Client umgeht RLS ohnehin) ------
alter table public.marketing_plan_phases enable row level security;

create policy marketing_plan_phases_admin_all on public.marketing_plan_phases
  for all
  using (
    exists (
      select 1 from public.marketing_plans p
      where p.id = plan_id and public.is_org_admin(p.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.marketing_plans p
      where p.id = plan_id and public.is_org_admin(p.organization_id)
    )
  );
