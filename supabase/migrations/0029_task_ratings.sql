-- =============================================================================
-- Migration 0029 – Task result ratings (quality, 1–10 stars)
--
-- Colleagues rate the RESULT of a task (1–10). Feeds the quality factor of the
-- monthly award score. One rating per rater per task. Self-rating is blocked in
-- the action (an assignee cannot rate their own task). Agency staff only.
-- =============================================================================

create table if not exists public.task_ratings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  rater_user_id uuid not null references public.profiles(id) on delete cascade,
  stars integer not null check (stars between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, rater_user_id)
);
create index if not exists task_ratings_task_idx on public.task_ratings (task_id);

alter table public.task_ratings enable row level security;

create policy task_ratings_select on public.task_ratings
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy task_ratings_insert on public.task_ratings
  for insert with check (
    rater_user_id = auth.uid()
    and public.is_agency_staff()
    and organization_id in (select public.current_user_org_ids())
  );
create policy task_ratings_update on public.task_ratings
  for update using (rater_user_id = auth.uid()) with check (rater_user_id = auth.uid());
create policy task_ratings_delete on public.task_ratings
  for delete using (rater_user_id = auth.uid() or public.is_super_admin());

create trigger task_ratings_set_updated_at
  before update on public.task_ratings
  for each row execute function public.set_updated_at();
