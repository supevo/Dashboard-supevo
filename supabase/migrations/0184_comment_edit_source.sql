-- =============================================================================
-- Migration 0184 – Kommentar-Bearbeitung: Rohtext + Originalfassung
--
-- Für das Bearbeiten mit voller @Erwähnungs-Logik brauchen wir den ROHTEXT
-- (mit @[Name](id)-Tokens), wie ihn der/die Verfasser:in getippt hat – die
-- gespeicherte `body`-HTML kann die Tokens nicht zurückliefern. Zusätzlich
-- halten wir die ERSTE Fassung fest, damit man über „bearbeitet" die
-- Originalnachricht lesen kann.
-- =============================================================================

alter table public.comments
  add column if not exists body_source text;

alter table public.comments
  add column if not exists original_body text;

notify pgrst, 'reload schema';
