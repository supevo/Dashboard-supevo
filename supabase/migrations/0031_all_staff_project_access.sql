-- =============================================================================
-- Migration 0031 – All agency staff may access every project of their org
--
-- Previously a regular staff member could only access a project they were an
-- explicit project_member of; only org admins saw everything. The agency wants
-- full transparency: every staff member sees (and can work on) all clients and
-- projects of their organization. Clients remain restricted to their own
-- client-visible projects.
--
-- Only can_access_project is broadened. can_manage_project stays limited to
-- org admins / project leads, so project settings, membership and deletion are
-- still controlled.
-- =============================================================================

create or replace function public.can_access_project(p_project_id uuid)
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
      -- Clients: only client-visible projects of their own company, linked via
      -- a contact and an explicit project membership.
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
