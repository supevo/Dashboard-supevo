-- =============================================================================
-- Migration 0087 – Ideen-Board für Kunden
--
-- Der Kunde sammelt Ideen und kann eine Idee per 1-Klick selbst in die
-- Warteschlange schieben – dabei entsteht eine kundensichtbare Aufgabe in der
-- Queue-Spalte des gewählten Projekts (status → 'queued', task_id verlinkt).
--
-- Schreibzugriff läuft über Server-Actions mit Service-Client nach In-Code-
-- Autorisierung (Kunde muss Kontakt der Firma / Aufgabe sehen dürfen); daher nur
-- eine SELECT-Policy.
-- =============================================================================

create table if not exists public.client_ideas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'queued')),
  task_id uuid references public.tasks(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists client_ideas_company_idx
  on public.client_ideas (client_company_id, status);

alter table public.client_ideas enable row level security;

-- Read: agency staff of the org, or a contact of the idea's client company.
create policy client_ideas_select on public.client_ideas
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or exists (
      select 1 from public.client_contacts cc
      where cc.user_id = auth.uid()
        and cc.client_company_id = client_ideas.client_company_id
    )
  );
