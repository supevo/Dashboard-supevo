-- =============================================================================
-- Migration 0113 – Ordnungsdienst / Büro-Checkliste beim Ausstempeln
--
-- Beim Ausstempeln (nicht Pause) bekommt ein Mitarbeiter einen zufällig & fair
-- zugeteilten Checkpunkt (z. B. „Spüle sauber?"). Nach dem Erledigen prüft ein
-- anderer, zufällig zugeloster Kollege gegen (Doppelcheck). Für Erledigen und
-- Prüfen gibt es XP. Die Checkpunkte pflegt die Leitung selbst.
-- =============================================================================

-- Benachrichtigungstyp für Ordnungsdienst-Prüfungen.
alter type public.notification_type add value if not exists 'chore';

-- --- Katalog: die von der Leitung gepflegten Checkpunkte --------------------
create table if not exists public.office_chores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  text text not null,
  active boolean not null default true,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists office_chores_org_idx
  on public.office_chores (organization_id, position);

alter table public.office_chores enable row level security;

-- Alle Agentur-Mitarbeiter der Org dürfen die Checkpunkte lesen (sie sehen ihren
-- zugeteilten Text); nur Org-Admins pflegen sie.
create policy office_chores_select on public.office_chores
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy office_chores_admin on public.office_chores
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create trigger office_chores_set_updated_at
  before update on public.office_chores
  for each row execute function public.set_updated_at();

-- --- Zuweisungen: eine Zeile je zugeteiltem Checkpunkt ----------------------
do $$ begin
  create type public.office_chore_status as enum ('assigned', 'done', 'verified', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.office_chore_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  chore_id uuid not null references public.office_chores(id) on delete cascade,
  assignee_id uuid not null references public.profiles(id) on delete cascade,
  verifier_id uuid references public.profiles(id) on delete set null,
  status public.office_chore_status not null default 'assigned',
  work_session_id uuid references public.work_sessions(id) on delete set null,
  done_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists office_chore_assignments_assignee_idx
  on public.office_chore_assignments (assignee_id, status);
create index if not exists office_chore_assignments_verifier_idx
  on public.office_chore_assignments (verifier_id, status);
create index if not exists office_chore_assignments_org_idx
  on public.office_chore_assignments (organization_id, created_at);

alter table public.office_chore_assignments enable row level security;

-- Betroffene (Erlediger/Prüfer) und Agentur-Mitarbeiter der Org dürfen lesen;
-- geschrieben wird ausschließlich über den Service-Client nach App-Prüfung.
create policy office_chore_assignments_select on public.office_chore_assignments
  for select using (
    assignee_id = auth.uid()
    or verifier_id = auth.uid()
    or (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create trigger office_chore_assignments_set_updated_at
  before update on public.office_chore_assignments
  for each row execute function public.set_updated_at();

-- --- xp_events: wiederholbare, aufgabenlose Events je Referenz --------------
-- Chore-XP hängen nicht an einer Aufgabe (task_id), sollen sich aber je
-- Zuweisung wiederholen. Der bisherige „aufgabenlos = ein Event je Art"-Index
-- würde das verhindern. Wir führen ref_id ein und lassen den alten Index nur
-- noch für referenzlose Meilensteine (streak_N) greifen.
alter table public.xp_events
  add column if not exists ref_id uuid;

drop index if exists public.xp_events_user_kind_idx;
create unique index if not exists xp_events_user_kind_idx
  on public.xp_events (user_id, kind)
  where task_id is null and ref_id is null;

create unique index if not exists xp_events_user_kind_ref_idx
  on public.xp_events (user_id, kind, ref_id)
  where ref_id is not null;
