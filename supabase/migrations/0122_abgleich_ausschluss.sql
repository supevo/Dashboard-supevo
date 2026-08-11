-- =============================================================================
-- Migration 0122 – Abgleich: ausgeklammerte Kategorien
--
-- Bestimmte Kontoauszug-Kategorien (z. B. Privatentnahme, USt-Zahlung,
-- Umbuchung, Löhne …) sollen NICHT in den Abgleich einfließen – sie liegen dem
-- Steuerberater separat vor. Welche Kategorien ausgeklammert werden, ist je
-- Firma einstellbar (Finanzen → Einstellungen).
-- =============================================================================

alter table public.accounting_profiles
  add column if not exists abgleich_ausschluss text[] not null default '{}';
