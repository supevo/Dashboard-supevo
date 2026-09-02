-- =============================================================================
-- Migration 0178 – Projekt-Titelbild: Versions-Zeitstempel für unveränderliches
-- Caching
--
-- cover_updated_at wird beim Hochladen/Ändern des Titelbilds auf now() gesetzt.
-- Die Bild-URL trägt diesen Wert als ?v=<cover_updated_at>. Dadurch kann die
-- Auslieferung „immutable" mit langem Cache antworten: Der Browser lädt das
-- Titelbild erst dann neu, wenn sich cover_updated_at (also das Bild) ändert.
-- =============================================================================

alter table public.projects
  add column if not exists cover_updated_at timestamptz;
