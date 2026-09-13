-- =============================================================================
-- Migration 0199 – Aufgabe: zweite Rolle „Prüfer" (Kontrolle & Beratung)
--
-- Zusätzlich zum/zu den Verantwortlichen (task_assignees) kann eine Aufgabe
-- einen optionalen Prüfer haben. Ist der/die Verantwortliche fertig, reicht er
-- die Aufgabe zur Kontrolle ein (review_submitted_at wird gesetzt); der Prüfer
-- gibt frei oder schickt sie zurück. Der Prüfer bekommt für die Kontrolle XP.
-- =============================================================================

alter table public.tasks
  add column if not exists reviewer_id uuid
    references public.profiles(id) on delete set null,
  add column if not exists review_submitted_at timestamptz;

create index if not exists tasks_reviewer_idx on public.tasks (reviewer_id);
