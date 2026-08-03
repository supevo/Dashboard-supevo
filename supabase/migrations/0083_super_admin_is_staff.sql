-- =============================================================================
-- Migration 0083 – Super-admin counts as agency staff
--
-- Root cause of "als Superadmin fehlen mir Rechte zum Anlegen/Hochladen":
-- public.is_agency_staff() listed only agency_admin/project_manager/employee/
-- freelancer and left out super_admin. ~40 tables gate their INSERT/UPDATE
-- (and the storage read policy from 0008) on is_agency_staff(), almost always
-- paired with `organization_id in (select current_user_org_ids())`. So the
-- super-admin — who legitimately belongs to the org — passed the org-scope
-- clause but failed the staff clause, and every such write/upload was denied.
--
-- Fix: include super_admin in is_agency_staff(). This is safe:
--   * every consuming policy still pairs it with an org/project scope
--     (current_user_org_ids() / can_access_project()), so no cross-org access
--     is granted — super_admin only reaches the org(s) it is a member of;
--   * is_super_admin() is already OR'd in explicitly in several places
--     (can_view_profile, can_see_internal, is_org_admin), i.e. the intent has
--     always been that super_admin has full agency-side access. This closes the
--     gaps that were missed.
-- Because policies reference the function by name, replacing the function body
-- updates behaviour everywhere at once — no policy changes required.
-- =============================================================================

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
      and m.role in ('super_admin','agency_admin','project_manager','employee','freelancer')
  );
$$;
