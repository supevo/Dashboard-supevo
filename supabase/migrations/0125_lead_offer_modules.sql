-- =============================================================================
-- 0125 – Lead-Angebot: Modul-Baukasten am Lead (Onboarding-Termin)
-- Die im Termin zusammengestellten Module werden am Lead gespeichert; der
-- Angebotspreis nutzt die bestehende Spalte estimated_value_cents.
-- =============================================================================
alter table public.leads
  add column if not exists modules jsonb not null default '[]'::jsonb;
alter table public.leads
  add column if not exists offer_name text;
