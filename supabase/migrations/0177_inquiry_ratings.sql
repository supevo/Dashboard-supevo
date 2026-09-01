-- =============================================================================
-- Migration 0177 – Kundenanfragen: manuelle Sterne-Bewertung (1–10)
--
-- Kunde und Agentur bewerten einen Lead nach mehreren Kriterien (je 1–10):
--   price_realism  = realistische Preisvorstellung
--   friendliness   = Freundlichkeit
--   wealth         = Zahlungskraft / Wohlstand
-- Gespeichert als JSON-Objekt { key: 1..10 }. Zusätzlich zu den KI-Signalen
-- (Dringlichkeit/Potenzial), die aus dem Text abgeleitet werden.
-- =============================================================================

alter table public.web_inquiries
  add column if not exists ratings jsonb not null default '{}'::jsonb;
