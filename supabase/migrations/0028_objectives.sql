-- =============================================================================
-- Migration 0028 – Objectives & key results (OKRs per employee)
--
-- Each employee has objectives (goals) with checkable key results / milestones.
-- Progress = share of done key results. Owner or org admin manage; agency staff
-- of the org can view (for the boss cockpit). Completed key results carry points
-- that the cockpit aggregates into the gamification score.
-- =============================================================================

do $$ begin
  create type public.objective_status as enum ('active', 'done', 'archived');
exception when duplicate_object then null; end $$;

create table if not exists public.objectives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  period text,
  status public.objective_status not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists objectives_org_user_idx
  on public.objectives (organization_id, user_id);

create table if not exists public.key_results (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.objectives(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  points integer not null default 10 check (points between 0 and 100),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists key_results_objective_idx
  on public.key_results (objective_id);

alter table public.objectives enable row level security;
alter table public.key_results enable row level security;

create policy objectives_select on public.objectives
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy objectives_write on public.objectives
  for all
  using (user_id = auth.uid() or public.is_org_admin(organization_id))
  with check (user_id = auth.uid() or public.is_org_admin(organization_id));

create policy key_results_select on public.key_results
  for select using (
    exists (
      select 1 from public.objectives o
      where o.id = key_results.objective_id
        and (
          (public.is_agency_staff() and o.organization_id in (select public.current_user_org_ids()))
          or public.is_super_admin()
        )
    )
  );
create policy key_results_write on public.key_results
  for all
  using (
    exists (
      select 1 from public.objectives o
      where o.id = key_results.objective_id
        and (o.user_id = auth.uid() or public.is_org_admin(o.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.objectives o
      where o.id = key_results.objective_id
        and (o.user_id = auth.uid() or public.is_org_admin(o.organization_id))
    )
  );

create trigger objectives_set_updated_at
  before update on public.objectives
  for each row execute function public.set_updated_at();
