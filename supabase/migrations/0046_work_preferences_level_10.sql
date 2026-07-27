-- =============================================================================
-- Migration 0046 – Lieblingsarbeit: Herz-Skala 1–10
--
-- Ursprünglich (0021) war die Skala 1–5. UI und Server-Action wurden später auf
-- 10 Herzen erweitert (analog zu den Skills), die CHECK-Regel der Tabelle blieb
-- aber bei 1–5. Dadurch wurden Herzwerte 6–10 von der DB abgelehnt und still
-- verworfen ("werden nicht gespeichert"). Wir weiten die Regel auf 1–10.
-- =============================================================================

alter table public.work_preferences
  drop constraint if exists work_preferences_level_check;

alter table public.work_preferences
  add constraint work_preferences_level_check check (level between 1 and 10);
