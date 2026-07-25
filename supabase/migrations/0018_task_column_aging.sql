-- =============================================================================
-- Migration 0018 – Task column aging
--
-- Tracks when a task last entered its current column, so the board can flag
-- cards that have been sitting in one column too long (aging / SLA). Unlike
-- updated_at, this is only bumped on an actual column change — not on edits.
-- =============================================================================

alter table public.tasks
  add column if not exists column_entered_at timestamptz not null default now();

-- Backfill existing rows with a sensible baseline.
update public.tasks
  set column_entered_at = coalesce(updated_at, created_at, now())
  where column_entered_at is null;

-- Recreate move_task so it stamps column_entered_at when the column changes
-- (but not on a same-column reorder).
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
  select project_id, board_id, lock_version
    into v_project_id, v_board_id, v_lock
  from public.tasks where id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'TASK_NOT_FOUND';
  end if;
  if not public.can_access_project(v_project_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_lock <> p_expected_lock_version then
    raise exception 'LOCK_CONFLICT';
  end if;

  select * into v_col from public.board_columns
    where id = p_target_column_id for update;
  if not found or v_col.board_id <> v_board_id then
    raise exception 'INVALID_COLUMN';
  end if;

  if v_col.wip_limit is not null then
    select count(*) into v_total from public.tasks t
      where t.column_id = p_target_column_id and t.deleted_at is null
        and t.is_archived = false and t.id <> p_task_id;
    if v_total >= v_col.wip_limit then
      raise exception 'WIP_LIMIT_TOTAL';
    end if;
  end if;

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
        lock_version = lock_version + 1,
        column_entered_at = case
          when column_id <> p_target_column_id then now()
          else column_entered_at
        end
    where id = p_task_id;
end;
$$;
