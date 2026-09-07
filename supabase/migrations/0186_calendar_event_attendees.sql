-- =============================================================================
-- Migration 0186 – Termin-Teilnehmer (zugeordnete Mitarbeiter)
--
-- Kalender-Termine können jetzt Mitarbeiter als Teilnehmer haben. Damit tauchen
-- Termine im Tagesablauf der Beteiligten auf und werden – wie Aufgaben – bei der
-- Tages-/Kapazitätsplanung berücksichtigt (u. a. im GF-Cockpit).
-- =============================================================================

create table if not exists public.calendar_event_attendees (
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists calendar_event_attendees_user_idx
  on public.calendar_event_attendees (user_id);

alter table public.calendar_event_attendees enable row level security;

-- Sichtbar/verwaltbar für Agentur-Mitarbeiter der Organisation des Termins
-- (wie das Event selbst).
create policy calendar_event_attendees_all on public.calendar_event_attendees
  for all
  using (
    exists (
      select 1 from public.calendar_events e
      where e.id = calendar_event_attendees.event_id
        and public.is_agency_staff()
        and e.organization_id in (select public.current_user_org_ids())
    )
  )
  with check (
    exists (
      select 1 from public.calendar_events e
      where e.id = calendar_event_attendees.event_id
        and public.is_agency_staff()
        and e.organization_id in (select public.current_user_org_ids())
    )
  );

notify pgrst, 'reload schema';
