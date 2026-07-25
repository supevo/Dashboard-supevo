-- =============================================================================
-- Migration 0012 – Employee skills
--
-- Lets agency staff record skills with a proficiency level (0–10), e.g.
-- "Grafikdesign" 6/10. Basis for skill-based task suggestions. Users manage
-- their own skills; agency colleagues in the same organization may read them
-- (for suggestions/pickers).
-- =============================================================================

create table if not exists public.employee_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  level integer not null default 5 check (level between 0 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists employee_skills_user_idx
  on public.employee_skills (user_id);
create index if not exists employee_skills_org_idx
  on public.employee_skills (organization_id);

alter table public.employee_skills enable row level security;

create policy employee_skills_select on public.employee_skills
  for select using (
    user_id = auth.uid()
    or (
      public.is_agency_staff()
      and organization_id in (select public.current_user_org_ids())
    )
    or public.is_super_admin()
  );
create policy employee_skills_insert on public.employee_skills
  for insert with check (user_id = auth.uid() or public.is_super_admin());
create policy employee_skills_update on public.employee_skills
  for update using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());
create policy employee_skills_delete on public.employee_skills
  for delete using (user_id = auth.uid() or public.is_super_admin());

create trigger employee_skills_set_updated_at
  before update on public.employee_skills
  for each row execute function public.set_updated_at();
