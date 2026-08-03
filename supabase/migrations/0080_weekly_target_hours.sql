-- =============================================================================
-- Migration 0080 – Wochen-Soll (Arbeitsstunden) pro Mitarbeiter
--
-- Ermöglicht, jedem Mitarbeiter ein wöchentliches Stunden-Soll zu hinterlegen.
-- Ist keins gesetzt, gilt in der App ein Standard (40 Std). Wird für die
-- „Arbeitszeit diese Woche"-Anzeige (im Rahmen / zu wenig) genutzt.
-- =============================================================================

alter table public.memberships
  add column if not exists weekly_target_hours numeric;
