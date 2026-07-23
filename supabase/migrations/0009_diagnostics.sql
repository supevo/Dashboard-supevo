-- =============================================================================
-- Migration 0009 – Diagnose-Funktion
-- whoami() liefert die DB-Sicht auf das aktuell eingeloggte Konto: die
-- auth.uid(), ob es super_admin/agency_staff ist, und seine Mitgliedschaften.
-- Damit lässt sich in der App eindeutig prüfen, ob Rolle/Mitgliedschaft stimmen
-- (Ursache von RLS-Fehlern beim Schreiben).
-- =============================================================================
create or replace function public.whoami()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'uid', auth.uid(),
    'is_super_admin', public.is_super_admin(),
    'is_agency_staff', public.is_agency_staff(),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'organization_id', m.organization_id,
        'role', m.role,
        'status', m.status
      ))
      from public.memberships m
      where m.user_id = auth.uid()
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.whoami() to authenticated, anon;
