-- =============================================================================
-- Migration 0019 – Absences (vacation / sick / other)
--
-- Staff request time off; org admins approve or reject. All agency staff of the
-- organization can see the team's absences (for planning). Krank (sick) is
-- recorded like any other type; approval flow is the same.
-- =============================================================================

-- Notification type for absence request/decision events.
alter type public.notification_type add value if not exists 'absence';

do $$ begin
  create type public.absence_type as enum ('urlaub', 'krank', 'sonstiges');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.absence_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.absences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.absence_type not null default 'urlaub',
  start_date date not null,
  end_date date not null,
  note text,
  status public.absence_status not null default 'pending',
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint absences_date_order check (end_date >= start_date)
);
create index if not exists absences_org_range_idx
  on public.absences (organization_id, start_date, end_date);
create index if not exists absences_user_idx
  on public.absences (user_id, start_date);

alter table public.absences enable row level security;

-- All agency staff of the org may see the team's absences.
create policy absences_select on public.absences
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

-- Staff request their own absence.
create policy absences_insert on public.absences
  for insert with check (
    user_id = auth.uid()
    and public.is_agency_staff()
    and organization_id in (select public.current_user_org_ids())
  );

-- Requesters may edit/cancel their own pending request; org admins may decide.
create policy absences_update on public.absences
  for update using (
    (user_id = auth.uid() and status = 'pending')
    or public.is_org_admin(organization_id)
  )
  with check (
    (user_id = auth.uid())
    or public.is_org_admin(organization_id)
  );

-- Requesters may delete their own pending request; org admins may delete any.
create policy absences_delete on public.absences
  for delete using (
    (user_id = auth.uid() and status = 'pending')
    or public.is_org_admin(organization_id)
  );

create trigger absences_set_updated_at
  before update on public.absences
  for each row execute function public.set_updated_at();
