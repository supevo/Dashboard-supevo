-- =============================================================================
-- Migration 0202 – Eigenes Logo je Rechnungssteller (Billing Entity)
--
-- Bisher trugen ALLE Rechnungen das org-weite Logo (org_branding.logo_dark).
-- Bei mehreren Rechnungsstellern (z. B. „supevo" und „ONE STEP marketing") soll
-- jede Rechnung das Logo IHRES Rechnungsstellers tragen. Wir spiegeln dazu das
-- Org-Muster (data-URI in einer Spalte, direkt ins PDF einbettbar) auf die
-- Billing-Entity. `logo_path` (0045) bleibt ungenutzt/legacy.
-- =============================================================================

alter table public.billing_entities
  add column if not exists logo_dark text;
