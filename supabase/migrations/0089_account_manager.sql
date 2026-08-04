-- =============================================================================
-- Migration 0089 – Fester Ansprechpartner (Account Manager) pro Kunde
--
-- Jeder Kunde bekommt einen festen verantwortlichen Ansprechpartner aus dem
-- Agentur-Team. Wird vom Admin gesetzt und dem Kunden im Portal angezeigt
-- (Profilbild, Name, Direktkontakt). Nullable + on delete set null, damit ein
-- ausgeschiedener Mitarbeiter die Kundenzeile nicht blockiert.
-- =============================================================================

alter table public.client_companies
  add column if not exists account_manager_id uuid
    references public.profiles(id) on delete set null;
