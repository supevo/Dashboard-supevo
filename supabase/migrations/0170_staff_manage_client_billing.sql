-- =============================================================================
-- Migration 0170 – Agentur-Mitarbeiter dürfen die Kunden-Abrechnung bearbeiten
--
-- Bisher war die komplette Abrechnung eines Kunden (Mitgliedschaft/Preise,
-- Rechnungen, SEPA) sowie die Rechnungssteller-Liste nur für Org-Admins nutzbar.
-- Die Agentur möchte, dass alle aktiven Agentur-Mitarbeiter der Organisation die
-- Abrechnung eines Kunden vollständig bearbeiten können (analog zu 0031/0169 bei
-- Projekten). Kunden bleiben ausgeschlossen.
--
-- Relaxt werden nur die kundenbezogenen Abrechnungs-Tabellen:
--   * billing_entities   – LESEN (Rechnungssteller-Auswahl); Schreiben/Stammdaten
--                          der Rechnungssteller bleibt Admin-only (globale Ein-
--                          stellung, separate Buchhaltungs-Einstellungen).
--   * client_memberships – Schreiben (Konfigurator, Abrechnungsdetails, Mandat).
--   * invoices           – Schreiben (Entwürfe, Finalisieren, Versand, SEPA).
--   * invoice_items      – Schreiben (folgt der Rechnung).
--
-- Muster wie bei den bestehenden Select-Policies:
--   (is_agency_staff() and organization_id in current_user_org_ids())
--   or is_super_admin()
-- =============================================================================

-- --- billing_entities: LESEN für Agentur-Mitarbeiter (Schreiben bleibt Admin) --
drop policy if exists billing_entities_select on public.billing_entities;
create policy billing_entities_select on public.billing_entities
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

-- --- client_memberships: Schreiben für Agentur-Mitarbeiter -------------------
drop policy if exists client_memberships_write on public.client_memberships;
create policy client_memberships_write on public.client_memberships
  for all using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  ) with check (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

-- --- invoices: Schreiben für Agentur-Mitarbeiter ----------------------------
drop policy if exists invoices_write on public.invoices;
create policy invoices_write on public.invoices
  for all using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  ) with check (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

-- --- invoice_items: folgt der Rechnung --------------------------------------
drop policy if exists invoice_items_write on public.invoice_items;
create policy invoice_items_write on public.invoice_items
  for all using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and (
          (public.is_agency_staff() and i.organization_id in (select public.current_user_org_ids()))
          or public.is_super_admin()
        )
    )
  ) with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and (
          (public.is_agency_staff() and i.organization_id in (select public.current_user_org_ids()))
          or public.is_super_admin()
        )
    )
  );

notify pgrst, 'reload schema';
