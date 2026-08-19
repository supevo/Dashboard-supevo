-- =============================================================================
-- Migration 0151 – Buchhaltung: mehrere Belege je Zahlung (Amazon-Fall)
--
-- Manchmal deckt EINE Bankabbuchung MEHRERE Belege ab (z. B. ein Amazon-PDF mit
-- mehreren Rechnungs-Seiten, deren Summe dem abgebuchten Betrag entspricht). Das
-- 1:1-Feld bookkeeping_transactions.beleg_id reicht dafür nicht. Diese n:m-
-- Tabelle verknüpft eine Transaktion mit mehreren Belegen. beleg_id bleibt für
-- die einfachen 1:1-Fälle bestehen.
-- =============================================================================
set lock_timeout = '5s';

create table if not exists public.bookkeeping_tx_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_entity_id uuid not null references public.billing_entities(id) on delete cascade,
  transaction_id uuid not null
    references public.bookkeeping_transactions(id) on delete cascade,
  receipt_id uuid not null
    references public.bookkeeping_receipts(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (transaction_id, receipt_id)
);

create index if not exists bookkeeping_tx_receipts_tx_idx
  on public.bookkeeping_tx_receipts (transaction_id);
create index if not exists bookkeeping_tx_receipts_entity_idx
  on public.bookkeeping_tx_receipts (billing_entity_id);

alter table public.bookkeeping_tx_receipts enable row level security;

drop policy if exists bookkeeping_tx_receipts_select on public.bookkeeping_tx_receipts;
create policy bookkeeping_tx_receipts_select on public.bookkeeping_tx_receipts
  for select using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );
drop policy if exists bookkeeping_tx_receipts_write on public.bookkeeping_tx_receipts;
create policy bookkeeping_tx_receipts_write on public.bookkeeping_tx_receipts
  for all using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  ) with check (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );
