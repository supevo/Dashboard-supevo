-- =============================================================================
-- Migration 0169 – All agency staff may MANAGE every project of their org
--
-- Migration 0031 opened can_access_project to all agency staff (view + work on
-- every project), but can_manage_project stayed limited to org admins and the
-- project lead. In practice that meant a normal employee could only change
-- settings/structure (rename, status, client-visibility, board columns,
-- project members, recurring tasks, archive) on projects they led themselves.
--
-- The agency wants full transparency here too: every active agency staff member
-- of the project's organization may fully manage every project. Clients are NOT
-- agency staff, so they remain excluded from management entirely.
--
-- Only can_manage_project changes; can_access_project is untouched.
-- =============================================================================

create or replace function public.can_manage_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.deleted_at is null and (
      public.is_org_admin(p.organization_id)
      -- Any active agency staff of the project's organization.
      or (
        public.is_agency_staff()
        and p.organization_id in (select public.current_user_org_ids())
      )
    )
  );
$$;
