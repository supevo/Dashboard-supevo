-- =============================================================================
-- Bootstrap the first administrator.
--
-- There is no open registration, so the very first account is created here.
-- Steps:
--   1. In Supabase Studio -> Authentication -> Users, click "Add user" and
--      create the admin account (email + password, "Auto Confirm User" on).
--   2. Set v_admin_email below to that email address.
--   3. Run this script against the database:
--        psql "$DATABASE_URL" -f deploy/seed/bootstrap-admin.sql
--
-- It creates the agency organization and grants the user super_admin.
-- (super_admin is intentionally NOT assignable through the app UI.)
-- =============================================================================
do $$
declare
  v_admin_email text := 'admin@supevo.de';  -- <== HIER E-MAIL EINTRAGEN
  v_org_name    text := 'Supevo';
  v_org_slug    text := 'supevo';
  v_user_id uuid;
  v_org_id  uuid;
begin
  select id into v_user_id from auth.users where email = v_admin_email;
  if v_user_id is null then
    raise exception 'Kein auth-Benutzer mit E-Mail % gefunden. Bitte zuerst in Supabase Studio anlegen.', v_admin_email;
  end if;

  -- Agency organization (idempotent on slug).
  select id into v_org_id from public.organizations where slug = v_org_slug;
  if v_org_id is null then
    insert into public.organizations (name, type, slug)
    values (v_org_name, 'agency', v_org_slug)
    returning id into v_org_id;
  end if;

  insert into public.profiles (id, full_name, email)
  values (v_user_id, 'Administrator', v_admin_email)
  on conflict (id) do update set email = excluded.email;

  insert into public.memberships (user_id, organization_id, role, status)
  values (v_user_id, v_org_id, 'super_admin', 'active')
  on conflict (user_id, organization_id)
    do update set role = 'super_admin', status = 'active';

  raise notice 'Bootstrap OK: % ist super_admin der Organisation % (%).',
    v_admin_email, v_org_name, v_org_id;
end $$;
