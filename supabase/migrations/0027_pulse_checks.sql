-- =============================================================================
-- Migration 0027 – Weekly pulse check (team mood + anonymous feedback)
--
-- Each staff member records a weekly mood (1=schlecht, 2=ok, 3=gut) and an
-- optional comment. Individual entries are private to the person; leadership
-- only ever sees aggregates + anonymous comments (computed server-side via the
-- service client), so there is NO broad admin SELECT policy here on purpose.
-- =============================================================================

create table if not exists public.pulse_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  mood integer not null check (mood between 1 and 3),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create index if not exists pulse_checks_org_week_idx
  on public.pulse_checks (organization_id, week_start);

alter table public.pulse_checks enable row level security;

-- Users see and manage only their own entry. Aggregates for leadership are
-- built server-side with the service client (kept anonymous).
create policy pulse_checks_select_own on public.pulse_checks
  for select using (user_id = auth.uid() or public.is_super_admin());
create policy pulse_checks_insert on public.pulse_checks
  for insert with check (
    user_id = auth.uid()
    and public.is_agency_staff()
    and organization_id in (select public.current_user_org_ids())
  );
create policy pulse_checks_update on public.pulse_checks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger pulse_checks_set_updated_at
  before update on public.pulse_checks
  for each row execute function public.set_updated_at();
