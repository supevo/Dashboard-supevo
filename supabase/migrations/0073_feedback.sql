-- =============================================================================
-- Migration 0073 – Feedback (Fehler / Ideen / Wünsche)
--
-- Mitarbeiter UND Kunden können über einen Button unten links Fehler, Ideen und
-- Wünsche melden. Die Einträge landen im Agentur-Feedback-Board (kanban-artig:
-- sortieren nach Status, Notizen/Prompts festhalten).
--
-- Insert/Read laufen über den Service-Client nach App-Autorisierung (Kunden
-- haben keine Agentur-Org-Mitgliedschaft); RLS erlaubt zusätzlich Org-Admins
-- die volle Verwaltung.
-- =============================================================================

-- Benachrichtigungstyp für neues Feedback (für Org-Admins).
alter type public.notification_type add value if not exists 'feedback';

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text,
  author_role text not null default 'agency', -- 'agency' | 'client'
  kind text not null default 'idea' check (kind in ('bug', 'idea', 'wish')),
  title text not null,
  message text,
  status text not null default 'new'
    check (status in ('new', 'planned', 'in_progress', 'done', 'rejected')),
  admin_notes text,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_org_status_idx
  on public.feedback (organization_id, status, position);

alter table public.feedback enable row level security;

-- Org-Admins verwalten das gesamte Feedback ihrer Organisation.
create policy feedback_admin_all on public.feedback
  for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
