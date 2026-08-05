-- =============================================================================
-- Migration 0091 – WIP-Limit zählt nur kundensichtbare Aufgaben
--
-- Bug: In der „In Arbeit"-Spalte (Stage-Limit = gleichzeitige Kunden-Aufträge)
-- zählte move_task ALLE Aufgaben mit – auch interne (für den Kunden unsichtbare)
-- Team-Aufgaben. Dadurch bekam der Kunde bei „2/2" schon beim 2. Auftrag
-- „Limit erreicht", obwohl er nur eine sichtbare Aufgabe hatte.
--
-- Fix: Das Gesamt-WIP-Limit ignoriert interne Aufgaben (is_internal = true).
-- Damit entspricht die Zählung genau dem, was der Kunde sieht. Alles andere an
-- move_task (Lock, column_entered_at, reopen_count, per-User-Limit) bleibt gleich.
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
  v_source_column_id uuid;
  v_source_done boolean;
  v_col record;
  v_total integer;
  v_per_user_conflict boolean;
begin
  select project_id, board_id, lock_version, column_id
    into v_project_id, v_board_id, v_lock, v_source_column_id
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

  select coalesce(is_done_column, false) into v_source_done
    from public.board_columns where id = v_source_column_id;

  select * into v_col from public.board_columns
    where id = p_target_column_id for update;
  if not found or v_col.board_id <> v_board_id then
    raise exception 'INVALID_COLUMN';
  end if;

  if v_col.wip_limit is not null then
    -- Nur kundensichtbare Aufgaben zählen gegen das Stage-Limit; interne
    -- Team-Aufgaben sind keine „Aufträge" des Kunden.
    select count(*) into v_total from public.tasks t
      where t.column_id = p_target_column_id and t.deleted_at is null
        and t.is_archived = false and t.is_internal = false
        and t.id <> p_task_id;
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
        end,
        reopen_count = reopen_count
          + case
              when v_source_done and coalesce(v_col.is_done_column, false) = false then 1
              else 0
            end
    where id = p_task_id;
end;
$$;
