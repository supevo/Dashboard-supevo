-- =============================================================================
-- Migration 0172 – Drucksachen-Abrechnung: Status „ordered" und „self_paid"
--
-- Bisher: null → 'required' → 'settled' | 'dismissed'.
-- Neu kommt die explizite Mitarbeiter-Antwort auf „Druckprodukt bestellt?":
--   'ordered'    = ja, bestellt – die Eingangsrechnung der Druckerei fehlt noch
--                  (Marker „Rechnung hochladen"); nach Upload → 'settled'.
--   'self_paid'  = der Kunde begleicht die Druckerei-Rechnung selbst → es wird
--                  KEINE Ausgangsrechnung an den Kunden erzeugt (Beleg-Upload
--                  optional weiterhin möglich).
-- 'dismissed' bleibt der Fehlalarm-Fall („kein Druckprodukt").
-- =============================================================================

alter table public.tasks
  drop constraint if exists tasks_print_billing_status_check;

alter table public.tasks
  add constraint tasks_print_billing_status_check
  check (print_billing_status in ('required', 'ordered', 'settled', 'dismissed', 'self_paid'));
