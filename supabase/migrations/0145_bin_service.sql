-- =============================================================================
-- Migration 0145 – Mülltonnenservice
-- Abfuhrtermine (aus ICS) je Tonne + Aufgaben (rausstellen/reinnehmen), die beim
-- Ausstempeln fair & zufällig verteilt werden. XP wie beim Ordnungsdienst.
-- =============================================================================

-- Abfuhrtermine je Tonne (aus der hochgeladenen ICS).
create table if not exists public.bin_pickups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bin_key text not null,     -- 'rest' | 'bio' | 'gelb' | 'blau' | 'other'
  bin_label text not null,   -- Original-SUMMARY (Anzeige)
  pickup_date date not null,
  created_at timestamptz not null default now(),
  unique (organization_id, bin_key, pickup_date)
);
create index if not exists bin_pickups_org_date_idx
  on public.bin_pickups (organization_id, pickup_date);

-- Kalender-Meta je Org (für „läuft aus"-Hinweis + Anzeige).
create table if not exists public.bin_calendar_meta (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  filename text,
  uploaded_at timestamptz not null default now(),
  coverage_end date,
  low_notified_for date       -- coverage_end, für das bereits gewarnt wurde
);

-- Aufgaben je Abfuhr: rausstellen (Vorabend) + reinnehmen (Abfuhrtag).
create table if not exists public.bin_task_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pickup_id uuid not null references public.bin_pickups(id) on delete cascade,
  action text not null,       -- 'out' | 'in'
  due_date date not null,
  assignee_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'assigned',  -- 'assigned' | 'done' | 'missed'
  work_session_id uuid references public.work_sessions(id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (pickup_id, action)
);
create index if not exists bin_task_assignee_idx
  on public.bin_task_assignments (assignee_id, status);
create index if not exists bin_task_due_idx
  on public.bin_task_assignments (organization_id, due_date);

alter table public.bin_pickups enable row level security;
alter table public.bin_calendar_meta enable row level security;
alter table public.bin_task_assignments enable row level security;

-- Lesen: Agentur-Mitarbeiter der Org (bzw. Betroffene); Schreiben über Service.
create policy bin_pickups_select on public.bin_pickups
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy bin_meta_select on public.bin_calendar_meta
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy bin_task_select on public.bin_task_assignments
  for select using (
    assignee_id = auth.uid()
    or (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
