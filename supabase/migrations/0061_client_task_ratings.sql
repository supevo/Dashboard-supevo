-- =============================================================================
-- Migration 0061 – Kunden-Bewertung der Ausführung pro Aufgabe
--
-- Der Kunde bewertet in einer fertigen (kundensichtbaren) Aufgabe die
-- Ausführung mit 1–5 Sternen und optionalem Kommentar. Getrennt von der
-- internen Qualitäts-Bewertung (task_ratings, 1–10, speist die Awards).
-- =============================================================================

create table if not exists public.client_task_ratings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  client_company_id uuid references public.client_companies(id) on delete set null,
  rated_by uuid not null references public.profiles(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, rated_by)
);

create index if not exists client_task_ratings_task_idx
  on public.client_task_ratings (task_id);

alter table public.client_task_ratings enable row level security;

-- Agentur-Mitarbeiter der Org sehen die Bewertungen; die bewertende Person sieht
-- ihre eigene. Geschrieben wird über den Service-Client nach App-Prüfung.
create policy client_task_ratings_select on public.client_task_ratings
  for select using (
    rated_by = auth.uid()
    or (
      public.is_agency_staff()
      and organization_id in (select public.current_user_org_ids())
    )
  );
