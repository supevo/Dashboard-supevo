-- =============================================================================
-- Migration 0014 – Recurring task templates
--
-- Templates that a daily cron turns into real tasks on a schedule (weekly or
-- monthly), e.g. a monthly report. Managing a template requires manage rights
-- on the project; the cron creates tasks via the service client.
-- =============================================================================

create table if not exists public.recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  column_id uuid not null references public.board_columns(id) on delete cascade,
  title text not null,
  description text,
  priority public.task_priority not null default 'medium',
  is_internal boolean not null default true,
  frequency text not null check (frequency in ('weekly', 'monthly')),
  weekday integer check (weekday between 0 and 6),       -- 0=Sunday (weekly)
  day_of_month integer check (day_of_month between 1 and 28), -- monthly
  next_run_date date not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recurring_tasks_due_idx
  on public.recurring_tasks (active, next_run_date);
create index if not exists recurring_tasks_project_idx
  on public.recurring_tasks (project_id);

alter table public.recurring_tasks enable row level security;

create policy recurring_tasks_select on public.recurring_tasks
  for select using (public.can_access_project(project_id));
create policy recurring_tasks_write on public.recurring_tasks
  for all
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

create trigger recurring_tasks_set_updated_at
  before update on public.recurring_tasks
  for each row execute function public.set_updated_at();
