-- =============================================================================
-- Migration 0021 – Work preferences ("Lieblingsarbeit")
--
-- Parallel to employee_skills, but expresses how much someone *likes* doing a
-- kind of work (1–5 hearts) rather than how good they are. Feeds smarter task
-- assignment. Users manage their own; agency colleagues in the org may read.
-- =============================================================================

create table if not exists public.work_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  level integer not null default 3 check (level between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists work_preferences_user_idx
  on public.work_preferences (user_id);
create index if not exists work_preferences_org_idx
  on public.work_preferences (organization_id);

alter table public.work_preferences enable row level security;

create policy work_preferences_select on public.work_preferences
  for select using (
    user_id = auth.uid()
    or (
      public.is_agency_staff()
      and organization_id in (select public.current_user_org_ids())
    )
    or public.is_super_admin()
  );
create policy work_preferences_insert on public.work_preferences
  for insert with check (user_id = auth.uid() or public.is_super_admin());
create policy work_preferences_update on public.work_preferences
  for update using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());
create policy work_preferences_delete on public.work_preferences
  for delete using (user_id = auth.uid() or public.is_super_admin());

create trigger work_preferences_set_updated_at
  before update on public.work_preferences
  for each row execute function public.set_updated_at();
