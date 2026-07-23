-- =============================================================================
-- Migration 0005 – Labels
-- Organization-wide labels with per-org unique names and client visibility.
-- =============================================================================

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text not null,
  description text,
  is_active boolean not null default true,
  is_client_visible boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Case-insensitive uniqueness per organization.
create unique index labels_org_name_unique
  on public.labels (organization_id, lower(name));
create trigger labels_set_updated_at before update on public.labels
  for each row execute function public.set_updated_at();

create table public.task_labels (
  task_id uuid not null references public.tasks(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (task_id, label_id)
);
create index task_labels_label_idx on public.task_labels (label_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.labels enable row level security;
alter table public.task_labels enable row level security;

-- labels: agency staff see all of their org; clients see only client-visible.
create policy labels_select on public.labels
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or (is_client_visible = true and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy labels_write on public.labels
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- task_labels: visible when the task is visible and the label is visible to
-- the viewer; assignment is an agency action (requires internal access).
create policy task_labels_select on public.task_labels
  for select using (
    exists (select 1 from public.tasks t
            where t.id = task_labels.task_id and public.can_access_project(t.project_id))
    and exists (select 1 from public.labels l where l.id = task_labels.label_id)
  );
create policy task_labels_write on public.task_labels
  for all using (
    exists (select 1 from public.tasks t
            where t.id = task_labels.task_id and public.can_see_internal(t.project_id))
  ) with check (
    exists (select 1 from public.tasks t
            where t.id = task_labels.task_id and public.can_see_internal(t.project_id))
  );
