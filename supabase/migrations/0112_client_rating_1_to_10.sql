-- =============================================================================
-- Migration 0112 – Kundenbewertung auf 1–10 erweitern (Ergebnis-Bewertung)
--
-- Die interne Ergebnis-Bewertung durch Mitarbeiter (task_ratings, 1–10) entfällt;
-- stattdessen bewertet der Kunde das Ergebnis auf einer 1–10-Skala. Dafür wird
-- die bisherige 1–5-Beschränkung auf client_task_ratings.stars auf 1–10
-- aufgeweitet. Bestehende Werte (1–5) bleiben gültig.
-- =============================================================================

alter table public.client_task_ratings
  drop constraint if exists client_task_ratings_stars_check;

alter table public.client_task_ratings
  add constraint client_task_ratings_stars_check check (stars between 1 and 10);
