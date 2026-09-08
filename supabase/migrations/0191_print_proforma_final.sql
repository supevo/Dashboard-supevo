-- =============================================================================
-- Migration 0191 – Drucksachen: Proforma- und Endrechnung getrennt + Erinnerungen
--
-- Bisher gab es genau EINEN Beleg-Upload je Druck-Aufgabe (setzte Status
-- „settled"). Fachlich braucht es aber ZWEI: die Proforma (sofort) und die
-- nachträgliche Endrechnung (~10 Tage später). Beide müssen hochgeladen werden.
--
--  * print_expenses.kind          – 'proforma' oder 'final' (Default 'final',
--                                    Bestandsbelege gelten als Endrechnung).
--  * tasks.print_flagged_at        – Zeitpunkt, ab dem die Druck-Abrechnung
--                                    ansteht (Anker für die 10-Tage-Frist).
--  * tasks.print_reminded_at       – letzte Erinnerung (Entprellung, 1×/Tag).
-- =============================================================================

alter table public.print_expenses
  add column if not exists kind text not null default 'final'
    check (kind in ('proforma', 'final'));

create index if not exists print_expenses_task_kind_idx
  on public.print_expenses (task_id, kind);

alter table public.tasks
  add column if not exists print_flagged_at timestamptz,
  add column if not exists print_reminded_at timestamptz;

notify pgrst, 'reload schema';
