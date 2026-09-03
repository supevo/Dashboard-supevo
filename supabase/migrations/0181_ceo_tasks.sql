-- =============================================================================
-- Migration 0181 – GF-Cockpit: persönliches Geschäftsführer-Board (ceo_tasks)
--
-- Ein privates Kanban-Board ausschließlich für den/die Geschäftsführer:in
-- (Super-Admin), getrennt von den Kunden-/Projektaufgaben. Jede Karte trägt eine
-- Aufwand-Schätzung (Minuten) und eine Eisenhower-Einordnung (Q1–Q4) – das ist
-- die Datengrundlage für den späteren KI-Coach (Phase 2), der daraus einen
-- 8-Stunden-Tagesablauf plant.
--
-- Sichtbarkeit: wie personal_reminders (0168) streng nutzer-eigen (user_id =
-- auth.uid()); die Seite /app/gf ist zusätzlich super-admin-only.
-- =============================================================================

create table if not exists public.ceo_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  title text not null,
  notes text,
  -- Kanban-Fluss: Backlog → Heute → In Arbeit → Erledigt.
  status text not null default 'backlog'
    check (status in ('backlog', 'today', 'doing', 'done')),
  -- Eisenhower-Quadrant (1 = wichtig+dringend … 4 = weder). null = noch offen.
  quadrant smallint check (quadrant between 1 and 4),
  -- Energie/Fokus-Art fürs Vormittag-/Nachmittag-Placement.
  energy text check (energy in ('deep', 'shallow')),
  -- Freitext-Bereich (Vertrieb, Strategie, Finanzen, Team …).
  area text,
  -- Aufwand-Schätzung in Minuten (Basis für die Tages-Kapazitätsrechnung).
  estimate_min integer check (estimate_min is null or estimate_min >= 0),
  due_date date,
  -- Manuelle Sortierung innerhalb einer Spalte (kleiner = weiter oben).
  position double precision not null default extract(epoch from now()),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ceo_tasks_user_idx
  on public.ceo_tasks (user_id, status, position);

alter table public.ceo_tasks enable row level security;

-- Streng nutzer-eigen: jede Person verwaltet ausschließlich ihre eigenen Karten.
create policy ceo_tasks_select on public.ceo_tasks
  for select using (user_id = auth.uid());
create policy ceo_tasks_insert on public.ceo_tasks
  for insert with check (user_id = auth.uid());
create policy ceo_tasks_update on public.ceo_tasks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ceo_tasks_delete on public.ceo_tasks
  for delete using (user_id = auth.uid());

notify pgrst, 'reload schema';
