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
