-- =============================================================================
-- Migration 0102 – Paket-Vorteile (Benefits) je Stage
--
-- Erlaubt Admins, je Paket eine Liste von Leistungen/Vorteilen zu hinterlegen
-- (eine Leistung pro Zeile). Beim Herabstufen im Kundenportal wird daraus die
-- Differenz berechnet und angezeigt, welche Vorteile der Kunde verliert.
-- =============================================================================

alter table public.billing_settings
  add column if not exists stage1_benefits text,
  add column if not exists stage2_benefits text;
