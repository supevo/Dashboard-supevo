-- =============================================================================
-- Migration 0074 – Marketingpläne (Jahresplan, Kunden-Abstimmung, Kanban)
--
-- Beim Onboarding erstellt die Agentur einen Jahres-Marketingplan aus einzelnen
-- Maßnahmen (pro Monat). Der Plan geht zur Abstimmung an den Kunden: pro
-- Maßnahme akzeptieren oder Änderung wünschen, oder den ganzen Plan annehmen.
-- Akzeptierte Maßnahmen werden als Kanban-Aufgaben ins Board des Kunden
-- übernommen (mit Fälligkeit im jeweiligen Monat).
--
-- Zugriff läuft über den Service-Client nach App-Autorisierung (Kunden haben
-- keine Agentur-Org-Mitgliedschaft); RLS erlaubt zusätzlich Org-Admins Vollzugriff.
-- =============================================================================

create table if not exists public.marketing_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  year integer not null,
  title text not null default 'Marketingplan',
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'accepted')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index if not exists marketing_plans_client_year_idx
  on public.marketing_plans (client_company_id, year);

create table if not exists public.marketing_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.marketing_plans(id) on delete cascade,
  month integer not null default 1 check (month >= 1 and month <= 12),
  title text not null,
  description text,
  status text not null default 'proposed'
    check (status in ('proposed', 'change_requested', 'accepted', 'embedded')),
  client_note text,
  position double precision not null default 0,
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_plan_items_plan_idx
  on public.marketing_plan_items (plan_id, month, position);

alter table public.marketing_plans enable row level security;
alter table public.marketing_plan_items enable row level security;

create policy marketing_plans_admin_all on public.marketing_plans
  for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy marketing_plan_items_admin_all on public.marketing_plan_items
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
