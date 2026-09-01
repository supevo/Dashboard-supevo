-- =============================================================================
-- Migration 0174 – Drucksachen: Beleg ↔ Ausgangsrechnung verknüpfen
--
-- Die monatliche Sammel-Ausgangsrechnung fasst alle noch nicht abgerechneten
-- Druck-Belege eines Kunden zusammen. invoice_id verhindert Doppel-Berechnung:
-- ein Beleg wird genau einer Ausgangsrechnung zugeordnet. NULL = noch offen
-- (fließt in die nächste Sammelrechnung). ON DELETE SET NULL, damit ein
-- gelöschter Rechnungsentwurf die Belege wieder freigibt.
-- =============================================================================

alter table public.print_expenses
  add column if not exists invoice_id uuid
    references public.invoices(id) on delete set null;

-- Schnell die noch offenen (abrechenbaren) Belege je Organisation finden.
create index if not exists print_expenses_open_idx
  on public.print_expenses (organization_id)
  where invoice_id is null;
