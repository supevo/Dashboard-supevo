-- =============================================================================
-- Migration 0024 – Widen work-preference scale from 1–5 to 1–10
--
-- Aligns "Lieblingsarbeit" with the skills scale (1–10). Safe to run whether or
-- not 0021 already applied the 1–5 constraint.
-- =============================================================================

alter table public.work_preferences
  drop constraint if exists work_preferences_level_check;
alter table public.work_preferences
  add constraint work_preferences_level_check check (level between 1 and 10);
