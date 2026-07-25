-- =============================================================================
-- Migration 0020 – Calendar events (customer appointments etc.)
--
-- Free-form calendar entries owned by the agency, optionally linked to a client
-- company (e.g. a customer meeting). Shown on the shared team calendar together
-- with absences and task deadlines. Managed by agency staff of the org.
-- =============================================================================

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  event_date date not null,
  start_time time,
  end_time time,
  client_company_id uuid references public.client_companies(id) on delete set null,
  location text,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calendar_events_org_date_idx
  on public.calendar_events (organization_id, event_date);

alter table public.calendar_events enable row level security;

create policy calendar_events_select on public.calendar_events
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create policy calendar_events_write on public.calendar_events
  for all
  using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  )
  with check (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();
