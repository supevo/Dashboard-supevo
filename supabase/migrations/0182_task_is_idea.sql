-- =============================================================================
-- Migration 0182 – Aufgaben-Kennzeichen „Idee"
--
-- Mitarbeiter legen häufig Ideen als Aufgaben an und schieben sie in die
-- Warteschlange – das System zieht sie dann als „muss gemacht werden" mit
-- (Zählungen, Überfälligkeit, Reports, Kundensicht). Eine Idee ist aber noch
-- KEINE verbindliche Aufgabe.
--
-- Lösung: ein Kennzeichen `is_idea`. Ideen werden zusätzlich `is_archived = true`
-- gespeichert, damit sie – wie archivierte Aufgaben – aus ALLEN aktiven
-- Ansichten/Zählungen herausfallen (die Board-Abfrage trennt Ideen dann vom
-- echten Archiv). Per „Übernehmen" wird aus einer Idee eine echte Aufgabe
-- (is_idea=false, is_archived=false) in der Warteschlange.
-- =============================================================================

alter table public.tasks
  add column if not exists is_idea boolean not null default false;

-- Ideen je Board schnell finden (Board-Ansicht lädt sie separat).
create index if not exists tasks_idea_idx
  on public.tasks (board_id)
  where is_idea;

notify pgrst, 'reload schema';
