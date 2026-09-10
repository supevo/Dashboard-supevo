-- =============================================================================
-- Migration 0197 – Drucksachen-Rechnung ↔ Buchhaltungs-Beleg verknüpfen
--
-- Die Endrechnung einer Drucksache wird zusätzlich als Eingangsrechnung in die
-- Buchhaltung gespiegelt (bookkeeping_receipts). receipt_id merkt sich diese
-- Verknüpfung: verhindert Doppelerfassung und erlaubt „✓ als Eingangsrechnung
-- erfasst" in der Drucksachen-Ansicht.
-- =============================================================================

alter table public.print_expenses
  add column if not exists receipt_id uuid
    references public.bookkeeping_receipts(id) on delete set null;

create index if not exists print_expenses_receipt_idx
  on public.print_expenses (receipt_id);
