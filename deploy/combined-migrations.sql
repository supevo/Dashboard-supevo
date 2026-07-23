-- =============================================================================
-- Supevo Dashboard – ALLE Migrationen kombiniert (0001–0008)
-- Einmalig im Supabase SQL Editor einfügen und AUSFÜHREN (Run).
-- Legt Tabellen, RLS-Policies, Funktionen und den Storage-Bucket 'files' an.
-- Nur EINMAL ausführen (erneutes Ausführen schlägt fehl, weil Typen/Tabellen
-- dann schon existieren – das ist normal).
-- =============================================================================


-- ####################################################################
-- ## 0001_foundation.sql
-- ####################################################################

-- =============================================================================
-- Migration 0001 – Foundation
-- Enums, core tenant tables (organizations, profiles, memberships,
-- invitations), RLS helper functions and base policies.
--
-- Security model: Row Level Security is the hard boundary. Helper functions
-- are SECURITY DEFINER so they can read membership rows without recursing
-- through RLS. All tenant scoping derives from auth.uid(), never from
-- client-supplied identifiers.
-- =============================================================================

create extension if not exists "pgcrypto";

-- --- Enums -------------------------------------------------------------------
create type organization_type as enum ('agency', 'client');
create type membership_status as enum ('invited', 'active', 'suspended');
create type app_role as enum (
  'super_admin', 'agency_admin', 'project_manager',
  'employee', 'freelancer', 'client', 'guest'
);

-- --- updated_at trigger helper ----------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --- organizations -----------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type organization_type not null,
  slug text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- --- profiles (extends auth.users) ------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  locale text not null default 'de',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- --- memberships -------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role app_role not null,
  status membership_status not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, organization_id)
);
create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_org_role_idx on public.memberships (organization_id, role);
create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

-- --- invitations -------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid, -- FK added in a later migration with client_companies
  email text not null,
  role app_role not null,
  token_hash text not null,
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_token_hash_idx on public.invitations (token_hash);
create index invitations_email_idx on public.invitations (lower(email));
-- Only one active invitation per email + organization.
create unique index invitations_active_unique
  on public.invitations (organization_id, lower(email))
  where accepted_at is null and revoked_at is null;
-- super_admin can never be granted via an invitation.
alter table public.invitations
  add constraint invitations_role_not_super_admin
  check (role <> 'super_admin');

-- =============================================================================
-- RLS helper functions (SECURITY DEFINER – bypass RLS to avoid recursion)
-- =============================================================================
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.role = 'super_admin'
      and m.status = 'active'
  );
$$;

create or replace function public.is_agency_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('agency_admin','project_manager','employee','freelancer')
  );
$$;

create or replace function public.current_user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.organization_id from public.memberships m
  where m.user_id = auth.uid() and m.status = 'active';
$$;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.organization_id = p_org_id
      and m.status = 'active'
      and m.role = 'agency_admin'
  ) or public.is_super_admin();
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;

-- organizations: members of an org may read it; admins may update it.
create policy organizations_select on public.organizations
  for select using (
    id in (select public.current_user_org_ids()) or public.is_super_admin()
  );
create policy organizations_update on public.organizations
  for update using (public.is_org_admin(id)) with check (public.is_org_admin(id));

-- profiles: a user manages their own profile.
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.is_super_admin());
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- memberships: a user reads their own memberships; org admins read all in
-- their org. (Write paths are added in Phase 2 with the management UI.)
create policy memberships_select_own on public.memberships
  for select using (
    user_id = auth.uid()
    or public.is_org_admin(organization_id)
  );

-- invitations: agency admins of the org may read them. Creation/acceptance
-- runs through the service client with explicit server-side checks.
create policy invitations_select_admin on public.invitations
  for select using (public.is_org_admin(organization_id));


-- ####################################################################
-- ## 0002_organizations_clients_roles.sql
-- ####################################################################

-- =============================================================================
-- Migration 0002 – Organizations, client companies, roles & audit
-- Adds client_companies, client_contacts and the append-only activity_log,
-- wires the invitations FK, and introduces write policies plus DB-level guards
-- for the management features (Phase 2).
-- =============================================================================

-- --- Enums -------------------------------------------------------------------
create type activity_action as enum (
  'create', 'update', 'delete', 'status_change', 'role_change',
  'login', 'logout', 'invite', 'invite_revoke', 'invite_resend',
  'member_deactivate', 'member_reactivate'
);

-- --- profiles: denormalized email for convenient member listings ------------
alter table public.profiles add column email text;

-- --- client_companies --------------------------------------------------------
create table public.client_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  contact_email text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, name)
);
create index client_companies_org_idx on public.client_companies (organization_id);
create trigger client_companies_set_updated_at
  before update on public.client_companies
  for each row execute function public.set_updated_at();

-- --- client_contacts ---------------------------------------------------------
create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (client_company_id, user_id)
);
create index client_contacts_user_idx on public.client_contacts (user_id);
create index client_contacts_company_idx on public.client_contacts (client_company_id);

-- --- invitations FK to client_companies -------------------------------------
alter table public.invitations
  add constraint invitations_client_company_fk
  foreign key (client_company_id)
  references public.client_companies(id) on delete cascade;

-- --- activity_log (append-only) ---------------------------------------------
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action activity_action not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_org_created_idx on public.activity_log (organization_id, created_at desc);
create index activity_log_entity_idx on public.activity_log (entity_type, entity_id);

-- =============================================================================
-- Additional RLS helper
-- =============================================================================
create or replace function public.current_user_client_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select cc.client_company_id
  from public.client_contacts cc
  where cc.user_id = auth.uid();
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.client_companies enable row level security;
alter table public.client_contacts enable row level security;
alter table public.activity_log enable row level security;

-- client_companies: agency staff see all in their org; clients see only their
-- own company. Only org admins may create/update.
create policy client_companies_select on public.client_companies
  for select using (
    deleted_at is null
    and (
      (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
      or id in (select public.current_user_client_company_ids())
      or public.is_super_admin()
    )
  );
create policy client_companies_insert on public.client_companies
  for insert with check (public.is_org_admin(organization_id));
create policy client_companies_update on public.client_companies
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- client_contacts: org admins and agency staff of the org may read; a user may
-- read their own contact rows. Only org admins may write.
create policy client_contacts_select on public.client_contacts
  for select using (
    user_id = auth.uid()
    or (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy client_contacts_insert on public.client_contacts
  for insert with check (public.is_org_admin(organization_id));
create policy client_contacts_delete on public.client_contacts
  for delete using (public.is_org_admin(organization_id));

-- memberships write policies (Phase 2). DB-level guards:
--  * super_admin can never be granted through a normal (non-service) session.
--  * no one may modify their OWN membership (prevents self-escalation).
create policy memberships_insert_admin on public.memberships
  for insert with check (
    public.is_org_admin(organization_id) and role <> 'super_admin'
  );
create policy memberships_update_admin on public.memberships
  for update using (
    public.is_org_admin(organization_id) and user_id <> auth.uid()
  )
  with check (
    public.is_org_admin(organization_id) and role <> 'super_admin'
  );

-- invitations write policies. role <> super_admin already enforced by the
-- table check constraint from migration 0001.
create policy invitations_insert_admin on public.invitations
  for insert with check (
    public.is_org_admin(organization_id)
    and (invited_by = auth.uid() or public.is_super_admin())
  );
create policy invitations_update_admin on public.invitations
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- activity_log: append-only. Insert by the acting user; read by org admins.
create policy activity_log_insert on public.activity_log
  for insert with check (
    actor_id = auth.uid() or public.is_super_admin()
  );
create policy activity_log_select on public.activity_log
  for select using (
    public.is_super_admin() or public.is_org_admin(organization_id)
  );
-- No update/delete policies -> updates/deletes are denied (tamper protection).


-- ####################################################################
-- ## 0003_projects_kanban.sql
-- ####################################################################

-- =============================================================================
-- Migration 0003 – Projects & Kanban
-- projects, project_members, boards, board_columns, tasks, task_assignees.
-- Project-scoped RLS helpers, a default-board trigger, and an atomic
-- move_task() function enforcing WIP limits + optimistic locking server-side.
-- =============================================================================

-- --- Extend activity_action with actions used from Phase 3 onward -----------
alter type activity_action add value if not exists 'archive';
alter type activity_action add value if not exists 'assignee_change';
alter type activity_action add value if not exists 'due_date_change';
alter type activity_action add value if not exists 'file_upload';
alter type activity_action add value if not exists 'file_download';
alter type activity_action add value if not exists 'comment';
alter type activity_action add value if not exists 'approval_request';
alter type activity_action add value if not exists 'approval_decision';
alter type activity_action add value if not exists 'time_edit';

-- --- Enums -------------------------------------------------------------------
create type project_status  as enum ('planned', 'active', 'on_hold', 'completed', 'archived');
create type project_member_role as enum ('lead', 'contributor', 'viewer', 'client');
create type task_priority   as enum ('low', 'medium', 'high', 'urgent');
create type column_key      as enum ('queue', 'active', 'review', 'done', 'custom');

-- --- projects ----------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete restrict,
  name text not null,
  description text,
  status project_status not null default 'planned',
  lead_user_id uuid references public.profiles(id) on delete set null,
  is_client_visible boolean not null default false,
  start_date date,
  due_date date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index projects_org_idx on public.projects (organization_id);
create index projects_client_idx on public.projects (client_company_id);
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- --- project_members ---------------------------------------------------------
create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role project_member_role not null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

-- --- boards ------------------------------------------------------------------
create table public.boards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Board',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index boards_project_idx on public.boards (project_id);
create trigger boards_set_updated_at before update on public.boards
  for each row execute function public.set_updated_at();

-- --- board_columns -----------------------------------------------------------
create table public.board_columns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  column_key column_key not null default 'custom',
  position integer not null,
  wip_limit integer check (wip_limit is null or wip_limit >= 0),
  wip_limit_per_user integer check (wip_limit_per_user is null or wip_limit_per_user >= 0),
  is_done_column boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index board_columns_board_idx on public.board_columns (board_id, position);
create trigger board_columns_set_updated_at before update on public.board_columns
  for each row execute function public.set_updated_at();

-- --- tasks -------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  column_id uuid not null references public.board_columns(id) on delete restrict,
  parent_task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  description text,
  priority task_priority not null default 'medium',
  created_by uuid not null references public.profiles(id),
  due_date date,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes >= 0),
  actual_minutes integer not null default 0,
  position numeric not null default 1000,
  is_internal boolean not null default true,
  is_blocked boolean not null default false,
  is_archived boolean not null default false,
  lock_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index tasks_column_position_idx on public.tasks (column_id, position);
create index tasks_project_internal_idx on public.tasks (project_id, is_internal);
create index tasks_org_archived_idx on public.tasks (organization_id, is_archived);
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- --- task_assignees ----------------------------------------------------------
create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index task_assignees_user_idx on public.task_assignees (user_id);

-- =============================================================================
-- Project-scoped RLS helpers (SECURITY DEFINER)
-- =============================================================================
create or replace function public.can_access_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.deleted_at is null and (
      public.is_org_admin(p.organization_id)
      or (
        public.is_agency_staff()
        and exists (select 1 from public.project_members pm
                    where pm.project_id = p.id and pm.user_id = auth.uid())
      )
      or (
        p.is_client_visible = true
        and exists (select 1 from public.project_members pm
                    where pm.project_id = p.id and pm.user_id = auth.uid())
        and exists (select 1 from public.client_contacts cc
                    where cc.user_id = auth.uid()
                      and cc.client_company_id = p.client_company_id)
      )
    )
  );
$$;

create or replace function public.can_manage_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.deleted_at is null and (
      public.is_org_admin(p.organization_id)
      or p.lead_user_id = auth.uid()
      or exists (select 1 from public.project_members pm
                 where pm.project_id = p.id and pm.user_id = auth.uid()
                   and pm.role = 'lead')
    )
  );
$$;

create or replace function public.can_see_internal(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or (public.is_agency_staff() and public.can_access_project(p_project_id));
$$;

-- Agency managers (admin or project_manager) that may create projects.
create or replace function public.is_org_agency_manager(p_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.organization_id = p_org_id
      and m.status = 'active' and m.role in ('agency_admin','project_manager')
  );
$$;

-- =============================================================================
-- Default board + standard columns on project creation
-- =============================================================================
create or replace function public.create_default_board()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_board_id uuid;
begin
  insert into public.boards (organization_id, project_id, name, position)
  values (new.organization_id, new.id, 'Board', 0)
  returning id into v_board_id;

  insert into public.board_columns
    (organization_id, board_id, name, column_key, position, wip_limit, wip_limit_per_user, is_done_column)
  values
    (new.organization_id, v_board_id, 'Warteschlange',  'queue',  0, null, null, false),
    (new.organization_id, v_board_id, 'Aktive Aufgabe', 'active', 1, null, 1,    false),
    (new.organization_id, v_board_id, 'In Überprüfung', 'review', 2, 5,    null, false),
    (new.organization_id, v_board_id, 'Fertig',         'done',   3, null, null, true);
  return new;
end;
$$;

create trigger projects_create_default_board
  after insert on public.projects
  for each row execute function public.create_default_board();

-- =============================================================================
-- Atomic task move with server-side WIP enforcement + optimistic locking
-- =============================================================================
create or replace function public.move_task(
  p_task_id uuid,
  p_target_column_id uuid,
  p_new_position numeric,
  p_expected_lock_version integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_board_id uuid;
  v_lock integer;
  v_col record;
  v_total integer;
  v_per_user_conflict boolean;
begin
  -- Load task + verify access.
  select project_id, board_id, lock_version
    into v_project_id, v_board_id, v_lock
  from public.tasks where id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'TASK_NOT_FOUND';
  end if;
  if not public.can_access_project(v_project_id) then
    raise exception 'FORBIDDEN';
  end if;

  -- Optimistic lock check.
  if v_lock <> p_expected_lock_version then
    raise exception 'LOCK_CONFLICT';
  end if;

  -- Lock the target column row to serialise concurrent moves.
  select * into v_col from public.board_columns
    where id = p_target_column_id for update;
  if not found or v_col.board_id <> v_board_id then
    raise exception 'INVALID_COLUMN';
  end if;

  -- Total WIP limit (exclude the task itself in case of same-column reorder).
  if v_col.wip_limit is not null then
    select count(*) into v_total from public.tasks t
      where t.column_id = p_target_column_id and t.deleted_at is null
        and t.is_archived = false and t.id <> p_task_id;
    if v_total >= v_col.wip_limit then
      raise exception 'WIP_LIMIT_TOTAL';
    end if;
  end if;

  -- Per-user WIP limit: any assignee of the moving task who would exceed it.
  if v_col.wip_limit_per_user is not null then
    select exists (
      select 1
      from public.task_assignees ta_move
      join public.task_assignees ta_col on ta_col.user_id = ta_move.user_id
      join public.tasks t on t.id = ta_col.task_id
      where ta_move.task_id = p_task_id
        and t.column_id = p_target_column_id
        and t.deleted_at is null and t.is_archived = false
        and t.id <> p_task_id
      group by ta_move.user_id
      having count(*) >= v_col.wip_limit_per_user
    ) into v_per_user_conflict;
    if v_per_user_conflict then
      raise exception 'WIP_LIMIT_USER';
    end if;
  end if;

  update public.tasks
    set column_id = p_target_column_id,
        position = p_new_position,
        lock_version = lock_version + 1
    where id = p_task_id;
end;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.boards enable row level security;
alter table public.board_columns enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;

-- projects
create policy projects_select on public.projects
  for select using (deleted_at is null and public.can_access_project(id));
create policy projects_insert on public.projects
  for insert with check (public.is_org_agency_manager(organization_id));
create policy projects_update on public.projects
  for update using (public.can_manage_project(id))
  with check (public.can_manage_project(id));

-- project_members
create policy project_members_select on public.project_members
  for select using (public.can_access_project(project_id));
create policy project_members_write on public.project_members
  for all using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

-- boards
create policy boards_select on public.boards
  for select using (public.can_access_project(project_id));
create policy boards_write on public.boards
  for all using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

-- board_columns
create policy board_columns_select on public.board_columns
  for select using (
    exists (select 1 from public.boards b
            where b.id = board_columns.board_id and public.can_access_project(b.project_id))
  );
create policy board_columns_write on public.board_columns
  for all using (
    exists (select 1 from public.boards b
            where b.id = board_columns.board_id and public.can_manage_project(b.project_id))
  ) with check (
    exists (select 1 from public.boards b
            where b.id = board_columns.board_id and public.can_manage_project(b.project_id))
  );

-- tasks: internal tasks hidden from clients; writes require agency access.
create policy tasks_select on public.tasks
  for select using (
    deleted_at is null
    and public.can_access_project(project_id)
    and (is_internal = false or public.can_see_internal(project_id))
  );
create policy tasks_insert on public.tasks
  for insert with check (
    public.can_see_internal(project_id)
    and created_by = auth.uid()
  );
create policy tasks_update on public.tasks
  for update using (public.can_see_internal(project_id))
  with check (public.can_see_internal(project_id));

-- task_assignees
create policy task_assignees_select on public.task_assignees
  for select using (
    exists (select 1 from public.tasks t
            where t.id = task_assignees.task_id and public.can_access_project(t.project_id))
  );
create policy task_assignees_write on public.task_assignees
  for all using (
    exists (select 1 from public.tasks t
            where t.id = task_assignees.task_id and public.can_see_internal(t.project_id))
  ) with check (
    exists (select 1 from public.tasks t
            where t.id = task_assignees.task_id and public.can_see_internal(t.project_id))
  );


-- ####################################################################
-- ## 0004_task_details.sql
-- ####################################################################

-- =============================================================================
-- Migration 0004 – Task details: comments, mentions, files, checklists,
-- notifications, and a private storage bucket with RLS.
-- =============================================================================

create type notification_type as enum (
  'task_assigned','comment_mention','client_comment','internal_question',
  'task_in_review','task_for_approval','approval_granted','changes_requested',
  'due_date_reached','task_overdue','file_uploaded'
);

-- --- comments ----------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  is_internal boolean not null default true,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index comments_task_idx on public.comments (task_id, created_at);

create table public.comment_mentions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (comment_id, mentioned_user_id)
);

-- --- files -------------------------------------------------------------------
create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  checksum_sha256 text,
  is_internal boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index files_task_idx on public.files (task_id);
create index files_project_internal_idx on public.files (project_id, is_internal);

-- --- checklists (agency-internal working tool) ------------------------------
create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checklists_task_idx on public.checklists (task_id);
create trigger checklists_set_updated_at before update on public.checklists
  for each row execute function public.set_updated_at();

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  content text not null,
  is_done boolean not null default false,
  position integer not null default 0,
  done_by uuid references public.profiles(id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checklist_items_list_idx on public.checklist_items (checklist_id, position);
create trigger checklist_items_set_updated_at before update on public.checklist_items
  for each row execute function public.set_updated_at();

-- --- notifications -----------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text,
  entity_type text not null,
  entity_id uuid,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx
  on public.notifications (recipient_id, is_read, created_at desc);

-- =============================================================================
-- Helper: checklist access via its task's project
-- =============================================================================
create or replace function public.task_id_project(p_task_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from public.tasks where id = p_task_id;
$$;

create or replace function public.checklist_project_id(p_checklist_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select t.project_id
  from public.checklists c join public.tasks t on t.id = c.task_id
  where c.id = p_checklist_id;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.comments enable row level security;
alter table public.comment_mentions enable row level security;
alter table public.files enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_items enable row level security;
alter table public.notifications enable row level security;

-- comments: internal comments never visible to clients.
create policy comments_select on public.comments
  for select using (
    deleted_at is null
    and public.can_access_project(project_id)
    and (is_internal = false or public.can_see_internal(project_id))
  );
create policy comments_insert on public.comments
  for insert with check (
    public.can_access_project(project_id)
    and author_id = auth.uid()
    and (is_internal = false or public.can_see_internal(project_id))
  );
create policy comments_update on public.comments
  for update using (author_id = auth.uid() or public.can_manage_project(project_id))
  with check (author_id = auth.uid() or public.can_manage_project(project_id));

-- comment_mentions: readable when the comment is readable.
create policy comment_mentions_select on public.comment_mentions
  for select using (
    exists (select 1 from public.comments c where c.id = comment_id)
  );
create policy comment_mentions_insert on public.comment_mentions
  for insert with check (
    exists (select 1 from public.comments c
            where c.id = comment_id and c.author_id = auth.uid())
  );

-- files: internal files never visible to clients.
create policy files_select on public.files
  for select using (
    deleted_at is null
    and public.can_access_project(project_id)
    and (is_internal = false or public.can_see_internal(project_id))
  );
create policy files_insert on public.files
  for insert with check (
    public.can_access_project(project_id)
    and uploaded_by = auth.uid()
    and (is_internal = false or public.can_see_internal(project_id))
  );
create policy files_update on public.files
  for update using (uploaded_by = auth.uid() or public.can_manage_project(project_id))
  with check (uploaded_by = auth.uid() or public.can_manage_project(project_id));

-- checklists + items: agency-internal (require can_see_internal).
create policy checklists_select on public.checklists
  for select using (public.can_see_internal(task_id_project(task_id)));
create policy checklists_write on public.checklists
  for all using (public.can_see_internal(task_id_project(task_id)))
  with check (public.can_see_internal(task_id_project(task_id)));
create policy checklist_items_select on public.checklist_items
  for select using (public.can_see_internal(public.checklist_project_id(checklist_id)));
create policy checklist_items_write on public.checklist_items
  for all using (public.can_see_internal(public.checklist_project_id(checklist_id)))
  with check (public.can_see_internal(public.checklist_project_id(checklist_id)));

-- notifications: recipients manage their own; creation happens via the
-- service client (server-side) after authorization.
create policy notifications_select on public.notifications
  for select using (recipient_id = auth.uid());
create policy notifications_update on public.notifications
  for update using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
create policy notifications_delete on public.notifications
  for delete using (recipient_id = auth.uid());

-- =============================================================================
-- Storage: private bucket + org-scoped policies (defence in depth).
-- Downloads are served via short-lived signed URLs created server-side after
-- the files-table RLS check; these policies additionally scope direct access.
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;

-- Path convention: org/{organization_id}/project/{project_id}/...
create policy "files bucket read own org"
  on storage.objects for select
  using (
    bucket_id = 'files'
    and (storage.foldername(name))[1] = 'org'
    and ((storage.foldername(name))[2])::uuid in (select public.current_user_org_ids())
  );
create policy "files bucket insert own org"
  on storage.objects for insert
  with check (
    bucket_id = 'files'
    and (storage.foldername(name))[1] = 'org'
    and ((storage.foldername(name))[2])::uuid in (select public.current_user_org_ids())
  );


-- ####################################################################
-- ## 0005_labels.sql
-- ####################################################################

-- =============================================================================
-- Migration 0005 – Labels
-- Organization-wide labels with per-org unique names and client visibility.
-- =============================================================================

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text not null,
  description text,
  is_active boolean not null default true,
  is_client_visible boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Case-insensitive uniqueness per organization.
create unique index labels_org_name_unique
  on public.labels (organization_id, lower(name));
create trigger labels_set_updated_at before update on public.labels
  for each row execute function public.set_updated_at();

create table public.task_labels (
  task_id uuid not null references public.tasks(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (task_id, label_id)
);
create index task_labels_label_idx on public.task_labels (label_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.labels enable row level security;
alter table public.task_labels enable row level security;

-- labels: agency staff see all of their org; clients see only client-visible.
create policy labels_select on public.labels
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or (is_client_visible = true and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy labels_write on public.labels
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- task_labels: visible when the task is visible and the label is visible to
-- the viewer; assignment is an agency action (requires internal access).
create policy task_labels_select on public.task_labels
  for select using (
    exists (select 1 from public.tasks t
            where t.id = task_labels.task_id and public.can_access_project(t.project_id))
    and exists (select 1 from public.labels l where l.id = task_labels.label_id)
  );
create policy task_labels_write on public.task_labels
  for all using (
    exists (select 1 from public.tasks t
            where t.id = task_labels.task_id and public.can_see_internal(t.project_id))
  ) with check (
    exists (select 1 from public.tasks t
            where t.id = task_labels.task_id and public.can_see_internal(t.project_id))
  );


-- ####################################################################
-- ## 0006_time_tracking.sql
-- ####################################################################

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


-- ####################################################################
-- ## 0007_approvals.sql
-- ####################################################################

-- =============================================================================
-- Migration 0007 – Approvals (client sign-off)
-- A task can be submitted for client approval; the client approves or requests
-- changes. On decision the task can auto-move to a configured column.
-- =============================================================================

create type approval_status as enum (
  'pending', 'approved', 'rejected', 'changes_requested'
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  status approval_status not null default 'pending',
  requested_by uuid not null references public.profiles(id),
  decided_by uuid references public.profiles(id) on delete set null,
  decision_comment text,
  target_column_id uuid references public.board_columns(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index approvals_project_status_idx on public.approvals (project_id, status);
create index approvals_client_status_idx on public.approvals (client_company_id, status);
-- At most one open approval per task.
create unique index approvals_one_open_per_task
  on public.approvals (task_id) where status = 'pending';
create trigger approvals_set_updated_at before update on public.approvals
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Redefine can_access_project: clients reach a project via their client company
-- and the project's client-visibility flag (no project_members row required).
-- =============================================================================
create or replace function public.can_access_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.deleted_at is null and (
      public.is_org_admin(p.organization_id)
      or (
        public.is_agency_staff()
        and exists (select 1 from public.project_members pm
                    where pm.project_id = p.id and pm.user_id = auth.uid())
      )
      or (
        p.is_client_visible = true
        and exists (select 1 from public.client_contacts cc
                    where cc.user_id = auth.uid()
                      and cc.client_company_id = p.client_company_id)
      )
    )
  );
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.approvals enable row level security;

-- Visible to agency staff with project access and to the client of the project.
create policy approvals_select on public.approvals
  for select using (public.can_access_project(project_id));

-- Only agency staff (internal access) may create/request approvals.
create policy approvals_insert on public.approvals
  for insert with check (
    public.can_see_internal(project_id) and requested_by = auth.uid()
  );

-- Update is used both for the client decision and agency edits. The client may
-- only decide on approvals for their own accessible project; agency staff with
-- internal access may also update. Column-level correctness (who may set which
-- status) is additionally enforced in the server action.
create policy approvals_update on public.approvals
  for update using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));


-- ####################################################################
-- ## 0008_security_hardening.sql
-- ####################################################################

-- =============================================================================
-- Migration 0008 – Security hardening (Phase 9)
--  1) Storage read policy limited to agency staff. Clients (who are members of
--     the agency org) must NOT be able to read internal file objects directly;
--     they receive files only through the server-issued signed-URL download
--     route, which enforces the files-table is_internal check first.
--  2) profiles readable by coworkers (agency staff sharing an org) so names
--     render, while clients still see only their own profile.
-- =============================================================================

-- --- 1) Storage: replace the broad org-read policy with agency-only read -----
drop policy if exists "files bucket read own org" on storage.objects;

create policy "files bucket read agency"
  on storage.objects for select
  using (
    bucket_id = 'files'
    and public.is_agency_staff()
    and (storage.foldername(name))[1] = 'org'
    and ((storage.foldername(name))[2])::uuid in (select public.current_user_org_ids())
  );

-- --- 2) profiles visibility for coworkers ------------------------------------
create or replace function public.can_view_profile(p_target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    p_target = auth.uid()
    or public.is_super_admin()
    or (
      public.is_agency_staff() and exists (
        select 1
        from public.memberships m1
        join public.memberships m2 on m1.organization_id = m2.organization_id
        where m1.user_id = auth.uid()
          and m1.status = 'active'
          and m2.user_id = p_target
      )
    );
$$;

create policy profiles_select_coworkers on public.profiles
  for select using (public.can_view_profile(id));

