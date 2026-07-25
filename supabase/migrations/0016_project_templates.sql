-- =============================================================================
-- Migration 0016 – Project / task templates
--
-- Reusable checklists of standard tasks. Applying a template to a project seeds
-- its tasks into the queue column. Tasks are stored as JSON on the template.
-- Managed by agency staff of the organization.
-- =============================================================================

create table if not exists public.project_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  tasks jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_templates_org_idx
  on public.project_templates (organization_id, created_at desc);

alter table public.project_templates enable row level security;

create policy project_templates_select on public.project_templates
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create policy project_templates_write on public.project_templates
  for all
  using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  )
  with check (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create trigger project_templates_set_updated_at
  before update on public.project_templates
  for each row execute function public.set_updated_at();
