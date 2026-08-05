-- =============================================================================
-- Migration 0098 – Drucksachen-Abrechnung: Status „dismissed"
--
-- Erlaubt es, einen fälschlich erkannten Druckprodukt-Hinweis zu verwerfen
-- (Fehlalarm). 'dismissed' ist terminal: die Erkennung setzt den Status nur von
-- NULL aus, ein verworfener Hinweis kommt also nicht wieder.
-- =============================================================================

alter table public.tasks
  drop constraint if exists tasks_print_billing_status_check;

alter table public.tasks
  add constraint tasks_print_billing_status_check
  check (print_billing_status in ('required', 'settled', 'dismissed'));
