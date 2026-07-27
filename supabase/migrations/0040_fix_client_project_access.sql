-- =============================================================================
-- Migration 0040 – Fix: clients can see their client-visible projects again
--
-- Regression from 0031: when can_access_project was broadened so all agency
-- staff can access every project, the CLIENT branch accidentally gained an
-- extra requirement — an explicit project_members row for the client user.
-- Clients are normally not project members, so they lost visibility of their
-- own client-visible projects (portal showed nothing).
--
-- This restores the original client rule (client-visible project + being a
-- contact of the project's company) while keeping the broadened agency-staff
-- access. can_manage_project is unchanged.
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
      -- Clients: their own client-visible projects, linked via a contact.
      or (
        p.is_client_visible = true
        and exists (select 1 from public.client_contacts cc
                    where cc.user_id = auth.uid()
                      and cc.client_company_id = p.client_company_id)
      )
    )
  );
$$;
