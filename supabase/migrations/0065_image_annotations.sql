-- =============================================================================
-- Migration 0065 – Visual Proofing: Bild-Markierungen (Änderungswünsche)
--
-- Der Kunde zeichnet Freihand-Markierungen auf hochgeladene Bilder und schreibt
-- einen Änderungswunsch dazu. Die Agentur sieht die Wünsche (read-only) und kann
-- sie als erledigt markieren. Strokes sind normalisierte Pfade (0..1), damit sie
-- unabhängig von der Anzeigegröße skalieren.
-- =============================================================================

create table if not exists public.image_annotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  strokes jsonb not null default '[]'::jsonb, -- [[{x,y}, …], …] normalisiert 0..1
  comment text,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists image_annotations_file_idx
  on public.image_annotations (file_id, created_at);

alter table public.image_annotations enable row level security;

-- Agentur-Mitarbeiter der Org sehen alle Markierungen. Kundenzugriff läuft über
-- den Service-Client nach vorheriger Datei-Sichtprüfung (in den Actions).
create policy image_annotations_select on public.image_annotations
  for select using (
    public.is_super_admin()
    or (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
  );
