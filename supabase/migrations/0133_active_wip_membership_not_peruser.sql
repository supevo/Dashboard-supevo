-- =============================================================================
-- 0133 – „Aktive Aufgabe"-Limit ist mitgliedschaftsbasiert, nicht pro Person
--
-- Das Limit der „Aktive Aufgabe"-Spalte steht für die Anzahl gleichzeitig
-- aktiver Kunden-Aufgaben und richtet sich nach der Mitgliedschaft (Stage 1 → 1,
-- Stage 2 → 2). Es gilt board-weit (Gesamt-Limit), NICHT pro Person.
--
-- Beide Stage-Sync-Pfade (setClientStageAction, setMembership...) setzen bereits
-- korrekt `wip_limit = stage, wip_limit_per_user = null`. Nur die Standard-
-- Boarderzeugung aus 0003 setzte die Spalte noch auf `wip_limit_per_user = 1`,
-- weshalb frisch angelegte Projekte fälschlich „1 pro Person" anzeigten, bis ein
-- Stage-Sync lief. Diese Migration korrigiert den Default und repariert Bestände.
-- =============================================================================

-- 1) Default der Boarderzeugung korrigieren: aktive Spalte als Gesamt-Limit (1
--    als Stage-1-Basis), ohne Pro-Person-Limit.
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
    (new.organization_id, v_board_id, 'Aktive Aufgabe', 'active', 1, 1,    null, false),
    (new.organization_id, v_board_id, 'In Überprüfung', 'review', 2, 5,    null, false),
    (new.organization_id, v_board_id, 'Fertig',         'done',   3, null, null, true);
  return new;
end;
$$;

-- 2) Bestehende „active"-Spalten mit stehengebliebenem Pro-Person-Limit auf das
--    mitgliedschaftsbasierte Gesamt-Limit umstellen (Stage der Mitgliedschaft,
--    Fallback 1) und das Pro-Person-Limit entfernen. Bereits per Stage-Sync
--    korrigierte Spalten (wip_limit_per_user is null) bleiben unberührt.
update public.board_columns bc
   set wip_limit = coalesce(cm.stage, 1),
       wip_limit_per_user = null
  from public.boards b
  join public.projects p on p.id = b.project_id
  left join public.client_memberships cm on cm.client_company_id = p.client_company_id
 where bc.board_id = b.id
   and bc.column_key = 'active'
   and bc.wip_limit_per_user is not null;
