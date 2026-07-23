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
