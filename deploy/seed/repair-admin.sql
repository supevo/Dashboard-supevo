-- =============================================================================
-- Reparatur: das aktuell eingeloggte Konto zum super_admin machen
--
-- Nutze das, wenn diagnose.sql zeigt, dass deine Login-E-Mail keine aktive
-- Admin-Mitgliedschaft hat (häufig, weil mehrere Testnutzer angelegt wurden und
-- der ursprüngliche Bootstrap auf eine andere E-Mail lief).
--
-- 1) v_admin_email unten auf GENAU die E-Mail setzen, mit der du dich in der
--    App einloggst.
-- 2) Im Supabase SQL Editor ausführen.
--
-- Idempotent: legt die Agentur-Organisation an (falls nicht vorhanden) und
-- setzt/aktualisiert die Mitgliedschaft auf super_admin + active.
-- =============================================================================
do $$
declare
  v_admin_email text := 'DEINE-LOGIN-EMAIL@example.de';  -- <== HIER EINTRAGEN
  v_org_name    text := 'Supevo';
  v_org_slug    text := 'supevo';
  v_user_id uuid;
  v_org_id  uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(v_admin_email);
  if v_user_id is null then
    raise exception 'Kein Auth-Benutzer mit E-Mail % gefunden. Genau die Login-E-Mail eintragen.', v_admin_email;
  end if;

  select id into v_org_id from public.organizations where type = 'agency' order by created_at limit 1;
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

  raise notice 'OK: % ist jetzt super_admin (active) der Organisation % (%).',
    v_admin_email, v_org_name, v_org_id;
end $$;

-- Danach in der App EINMAL ab- und wieder anmelden (frische Session/Rollen).
