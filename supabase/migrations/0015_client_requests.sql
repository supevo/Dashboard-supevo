-- =============================================================================
-- Migration 0015 – Client briefings / requests
--
-- A client submits a free-text briefing for a project; the AI splits it into
-- task suggestions. Agency staff review the suggestions and turn the good ones
-- into real tasks. Suggestions are stored as JSON on the request.
-- =============================================================================

do $$ begin
  create type public.client_request_status as enum ('new', 'processed', 'dismissed');
exception when duplicate_object then null; end $$;

create table if not exists public.client_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  submitted_by uuid references public.profiles(id) on delete set null,
  body text not null,
  suggestions jsonb not null default '[]'::jsonb,
  status public.client_request_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_requests_company_idx
  on public.client_requests (client_company_id, created_at desc);
create index if not exists client_requests_project_idx
  on public.client_requests (project_id);

alter table public.client_requests enable row level security;

-- Agency staff of the org see all; the submitter sees their own.
create policy client_requests_select on public.client_requests
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
    or submitted_by = auth.uid()
  );

-- A client may submit a briefing for a project they can access.
create policy client_requests_insert on public.client_requests
  for insert with check (
    submitted_by = auth.uid() and public.can_access_project(project_id)
  );

-- Agency staff manage status/suggestions.
create policy client_requests_update on public.client_requests
  for update using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  )
  with check (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create trigger client_requests_set_updated_at
  before update on public.client_requests
  for each row execute function public.set_updated_at();
