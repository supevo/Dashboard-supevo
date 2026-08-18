-- =============================================================================
-- 0139 – xp_events.task_id beim Löschen einer Aufgabe mitlöschen (statt NULL)
--
-- Bisher: task_id REFERENCES tasks ON DELETE SET NULL. Beim Löschen mehrerer
-- Aufgaben eines Kunden (z. B. Kunden-Purge) wurden die zugehörigen XP-Events
-- auf task_id = NULL gesetzt. Zwei aufgabenbezogene Events gleicher `kind` eines
-- Nutzers kollidieren danach mit dem partiellen Unique-Index
-- xp_events_user_kind_idx (user_id, kind) WHERE task_id IS NULL AND ref_id IS
-- NULL → „duplicate key value violates unique constraint" und die ganze
-- Lösch-Transaktion schlägt fehl.
--
-- Fix: ON DELETE CASCADE – ein aufgabenbezogenes XP-Event wird mit seiner
-- Aufgabe entfernt (ohne Aufgabe ist es ohnehin bedeutungslos). Keine NULL-
-- Kollision mehr.
-- =============================================================================
alter table public.xp_events
  drop constraint if exists xp_events_task_id_fkey;
alter table public.xp_events
  add constraint xp_events_task_id_fkey
    foreign key (task_id) references public.tasks(id) on delete cascade;
