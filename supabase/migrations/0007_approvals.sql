-- =============================================================================
-- Migration 0007 – Approvals (client sign-off)
-- A task can be submitted for client approval; the client approves or requests
-- changes. On decision the task can auto-move to a configured column.
-- =============================================================================

create type approval_status as enum (
  'pending', 'approved', 'rejected', 'changes_requested'
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  status approval_status not null default 'pending',
  requested_by uuid not null references public.profiles(id),
  decided_by uuid references public.profiles(id) on delete set null,
  decision_comment text,
  target_column_id uuid references public.board_columns(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index approvals_project_status_idx on public.approvals (project_id, status);
create index approvals_client_status_idx on public.approvals (client_company_id, status);
-- At most one open approval per task.
create unique index approvals_one_open_per_task
  on public.approvals (task_id) where status = 'pending';
create trigger approvals_set_updated_at before update on public.approvals
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Redefine can_access_project: clients reach a project via their client company
-- and the project's client-visibility flag (no project_members row required).
-- =============================================================================
create or replace function public.can_access_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.deleted_at is null and (
      public.is_org_admin(p.organization_id)
      or (
        public.is_agency_staff()
        and exists (select 1 from public.project_members pm
                    where pm.project_id = p.id and pm.user_id = auth.uid())
      )
      or (
        p.is_client_visible = true
        and exists (select 1 from public.client_contacts cc
                    where cc.user_id = auth.uid()
                      and cc.client_company_id = p.client_company_id)
      )
    )
  );
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.approvals enable row level security;

-- Visible to agency staff with project access and to the client of the project.
create policy approvals_select on public.approvals
  for select using (public.can_access_project(project_id));

-- Only agency staff (internal access) may create/request approvals.
create policy approvals_insert on public.approvals
  for insert with check (
    public.can_see_internal(project_id) and requested_by = auth.uid()
  );

-- Update is used both for the client decision and agency edits. The client may
-- only decide on approvals for their own accessible project; agency staff with
-- internal access may also update. Column-level correctness (who may set which
-- status) is additionally enforced in the server action.
create policy approvals_update on public.approvals
  for update using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));
