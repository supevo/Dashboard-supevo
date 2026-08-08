-- =============================================================================
-- Migration 0108 – Client page ↔ task links
--
-- Lets an internal client page reference one or more of the client's tasks
-- ("Verknüpfte Aufgaben"). Team-internal, agency-staff only.
-- =============================================================================

create table if not exists public.client_page_tasks (
  page_id uuid not null references public.client_pages(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (page_id, task_id)
);
create index if not exists client_page_tasks_task_idx
  on public.client_page_tasks (task_id);

alter table public.client_page_tasks enable row level security;

create policy client_page_tasks_select on public.client_page_tasks
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create policy client_page_tasks_insert on public.client_page_tasks
  for insert with check (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create policy client_page_tasks_delete on public.client_page_tasks
  for delete using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
