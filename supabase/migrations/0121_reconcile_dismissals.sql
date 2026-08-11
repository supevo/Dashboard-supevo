-- =============================================================================
-- Migration 0121 – Abgleich: abgelehnte Vorschläge merken
--
-- Im Abgleich kann ein Vorschlag falsch sein (Betrag/Datum passen zufällig).
-- „Ablehnen" merkt sich das Paar (a_id ↔ b_id), damit genau diese Kombination
-- nicht wieder vorgeschlagen wird – beide Seiten bleiben aber für andere
-- Zuordnungen verfügbar.
--   * Zahlung ↔ Rechnung:      a = transaction_id, b = invoice_id
--   * Beleg  ↔ Buchung:        a = receipt_id,     b = transaction_id
--   * Sammelzahlung:           je Rechnung ein Paar (transaction_id, invoice_id)
--   * Teilzahlung:             je Zahlung ein Paar  (invoice_id, transaction_id)
-- =============================================================================

create table if not exists public.bookkeeping_reconcile_dismissals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_entity_id uuid not null references public.billing_entities(id) on delete cascade,
  a_id uuid not null,
  b_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (billing_entity_id, a_id, b_id)
);

create index if not exists bookkeeping_reconcile_dismissals_entity_idx
  on public.bookkeeping_reconcile_dismissals (billing_entity_id);

alter table public.bookkeeping_reconcile_dismissals enable row level security;

drop policy if exists bookkeeping_reconcile_dismissals_select
  on public.bookkeeping_reconcile_dismissals;
create policy bookkeeping_reconcile_dismissals_select
  on public.bookkeeping_reconcile_dismissals
  for select using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );

drop policy if exists bookkeeping_reconcile_dismissals_write
  on public.bookkeeping_reconcile_dismissals;
create policy bookkeeping_reconcile_dismissals_write
  on public.bookkeeping_reconcile_dismissals
  for all using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  ) with check (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );
