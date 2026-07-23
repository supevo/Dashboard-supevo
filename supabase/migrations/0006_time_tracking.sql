-- =============================================================================
-- Migration 0006 – Time tracking
-- Task time (timers + manual entries) and work time (clock in/out + breaks).
-- Timestamps stored in UTC; displayed in Europe/Berlin by the app.
-- Hard invariants are enforced by constraints, not just the UI.
-- =============================================================================

create extension if not exists btree_gist;

create type time_source as enum ('manual', 'timer');
create type work_session_status as enum ('active', 'on_break', 'closed');

-- --- time_entries (task/project time) ---------------------------------------
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_minutes integer,
  description text,
  is_billable boolean not null default true,
  is_client_visible boolean not null default false,
  source time_source not null default 'timer',
  created_by uuid not null references public.profiles(id),
  edit_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_positive_duration
    check (duration_minutes is null or duration_minutes > 0),
  constraint time_entries_end_after_start
    check (ended_at is null or ended_at > started_at)
);
create index time_entries_user_idx on public.time_entries (user_id, started_at desc);
create index time_entries_project_idx on public.time_entries (project_id);
create index time_entries_client_idx on public.time_entries (client_company_id);

-- Only ONE running timer per user.
create unique index time_entries_one_running_timer
  on public.time_entries (user_id)
  where ended_at is null and source = 'timer';

-- No unnoticed overlaps between completed entries of the same user.
alter table public.time_entries
  add constraint time_entries_no_overlap
  exclude using gist (
    user_id with =,
    tstzrange(started_at, ended_at) with &&
  ) where (ended_at is not null);

create trigger time_entries_set_updated_at before update on public.time_entries
  for each row execute function public.set_updated_at();

-- --- work_sessions (clock in/out) -------------------------------------------
create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  clock_in timestamptz not null,
  clock_out timestamptz,
  status work_session_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_sessions_end_after_start
    check (clock_out is null or clock_out > clock_in)
);
create index work_sessions_user_idx on public.work_sessions (user_id, clock_in desc);
-- Only ONE open work session per user.
create unique index work_sessions_one_open
  on public.work_sessions (user_id)
  where clock_out is null;
create trigger work_sessions_set_updated_at before update on public.work_sessions
  for each row execute function public.set_updated_at();

create table public.work_session_breaks (
  id uuid primary key default gen_random_uuid(),
  work_session_id uuid not null references public.work_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  break_start timestamptz not null,
  break_end timestamptz,
  created_at timestamptz not null default now(),
  constraint breaks_end_after_start
    check (break_end is null or break_end > break_start)
);
-- Only ONE open break per session.
create unique index work_session_breaks_one_open
  on public.work_session_breaks (work_session_id)
  where break_end is null;

-- =============================================================================
-- Row Level Security
-- Decision O2: all agency roles may see internal time entries of their org.
-- Clients only ever see entries explicitly marked client-visible.
-- =============================================================================
alter table public.time_entries enable row level security;
alter table public.work_sessions enable row level security;
alter table public.work_session_breaks enable row level security;

create policy time_entries_select on public.time_entries
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or (is_client_visible = true and public.can_access_project(project_id))
    or public.is_super_admin()
  );
create policy time_entries_insert on public.time_entries
  for insert with check (
    user_id = auth.uid()
    and public.is_agency_staff()
    and public.can_access_project(project_id)
  );
-- Own entries editable by the user; admins may correct others.
create policy time_entries_update on public.time_entries
  for update using (
    user_id = auth.uid() or public.is_org_admin(organization_id)
  ) with check (
    user_id = auth.uid() or public.is_org_admin(organization_id)
  );
create policy time_entries_delete on public.time_entries
  for delete using (
    user_id = auth.uid() or public.is_org_admin(organization_id)
  );

create policy work_sessions_select on public.work_sessions
  for select using (
    user_id = auth.uid() or public.is_org_admin(organization_id)
  );
create policy work_sessions_write on public.work_sessions
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy work_session_breaks_all on public.work_session_breaks
  for all using (
    exists (select 1 from public.work_sessions w
            where w.id = work_session_breaks.work_session_id
              and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.work_sessions w
            where w.id = work_session_breaks.work_session_id
              and w.user_id = auth.uid())
  );
