-- =============================================================================
-- Migration 0043 – Task view tracking (internal)
--
-- Records when an agency user opened a task and how long they stayed, so the
-- task's internal log can show per-person "last seen", view count and total
-- dwell time. Agency-only; clients never see this.
-- =============================================================================

create table if not exists public.task_views (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  opened_at timestamptz not null default now(),
  dwell_seconds integer not null default 0
);
create index if not exists task_views_task_idx on public.task_views (task_id, opened_at desc);
create index if not exists task_views_task_user_idx on public.task_views (task_id, user_id);

alter table public.task_views enable row level security;

-- Agency staff of the org may read view stats; clients never.
create policy task_views_select on public.task_views
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
-- A user records only their own views.
create policy task_views_insert on public.task_views
  for insert with check (
    user_id = auth.uid()
    and public.is_agency_staff()
    and organization_id in (select public.current_user_org_ids())
  );
create policy task_views_update on public.task_views
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
