-- =============================================================================
-- Migration 0094 – Stellvertretender Ansprechpartner pro Kunde
--
-- Ergänzt den festen (Haupt-)Ansprechpartner um eine optionale Stellvertretung.
-- Beide werden vom Admin gesetzt und dem Kunden im Portal angezeigt. Nullable +
-- on delete set null, damit ein ausgeschiedener Mitarbeiter die Kundenzeile
-- nicht blockiert.
-- =============================================================================

alter table public.client_companies
  add column if not exists secondary_account_manager_id uuid
    references public.profiles(id) on delete set null;
