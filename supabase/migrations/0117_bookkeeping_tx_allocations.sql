-- =============================================================================
-- Migration 0117 – Buchhaltung: Sammelzahlungen (Zahlung ↔ mehrere Rechnungen)
--
-- Eine Bankzahlung kann mehrere Rechnungen abdecken (Sammelüberweisung) – das
-- 1:1-Feld bookkeeping_transactions.re_id reicht dafür nicht. Diese n:m-Tabelle
-- verknüpft eine Transaktion mit mehreren Rechnungen und hält je Rechnung den
-- zugeordneten Teilbetrag. re_id bleibt für die einfachen 1:1-Fälle bestehen.
-- =============================================================================

create table if not exists public.bookkeeping_tx_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_entity_id uuid not null references public.billing_entities(id) on delete cascade,
  transaction_id uuid not null
    references public.bookkeeping_transactions(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  betrag_cents bigint not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (transaction_id, invoice_id)
);

create index if not exists bookkeeping_tx_allocations_tx_idx
  on public.bookkeeping_tx_allocations (transaction_id);
create index if not exists bookkeeping_tx_allocations_entity_idx
  on public.bookkeeping_tx_allocations (billing_entity_id);

alter table public.bookkeeping_tx_allocations enable row level security;

create policy bookkeeping_tx_allocations_select on public.bookkeeping_tx_allocations
  for select using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );
create policy bookkeeping_tx_allocations_write on public.bookkeeping_tx_allocations
  for all using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  ) with check (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );
