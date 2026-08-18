-- =============================================================================
-- 0138 – Harte Purge-Funktionen für den Pre-Live-Reset (Testdaten)
-- Zwei SECURITY-DEFINER-Funktionen, die NUR serverseitig über den Service-Client
-- nach einer Master-Passwort-Prüfung in der App aufgerufen werden. Für Endnutzer
-- gesperrt (revoke). Atomar (Funktionskörper = eine Transaktion).
-- =============================================================================

-- Kunde endgültig löschen: die drei restrict-FK-Kinder zuerst (Projekte
-- kaskadieren ihre eigenen Kinder), danach kaskadiert der Kunden-Delete den Rest.
create or replace function public.purge_client_company(p_client uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.time_entries where client_company_id = p_client;
  delete from public.invoices where client_company_id = p_client;
  delete from public.projects where client_company_id = p_client;
  delete from public.client_companies where id = p_client;
end;
$$;

-- Mitarbeiter aus einer Organisation entfernen + Arbeitszeit-/Zeiterfassungsdaten
-- dieser Org löschen. Der Login-Account (auth/profiles) bleibt bestehen.
create or replace function public.purge_org_member(p_user uuid, p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.time_entries where user_id = p_user and organization_id = p_org;
  delete from public.work_sessions where user_id = p_user and organization_id = p_org;
  delete from public.memberships where user_id = p_user and organization_id = p_org;
end;
$$;

revoke all on function public.purge_client_company(uuid) from public, anon, authenticated;
revoke all on function public.purge_org_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purge_client_company(uuid) to service_role;
grant execute on function public.purge_org_member(uuid, uuid) to service_role;
