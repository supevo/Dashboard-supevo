-- =============================================================================
-- Migration 0116 – Buchhaltung: Bankkonten + Transaktionen (Kontoauszug-Import)
--
-- Kontoauszüge werden importiert (CSV dt. Banken/CAMT-CSV, CAMT.053, MT940, PDF)
-- und als Transaktionen je Firma abgelegt. betrag_cents > 0 = Eingang, < 0 =
-- Ausgang. Ein Import ist idempotent: import_hash (Datum+Betrag+Partner+Zweck)
-- ist je Firma eindeutig, überlappende Auszüge werden also übersprungen.
--
-- Verknüpfungen für den späteren Abgleich (Phase 5): beleg_id -> Beleg,
-- re_id -> Ausgangsrechnung (Zahlung). Alles trägt billing_entity_id als
-- Trennschlüssel; Zugriff intern (Org-Admins/Super-Admin).
-- =============================================================================

create table if not exists public.bookkeeping_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_entity_id uuid not null references public.billing_entities(id) on delete cascade,
  bank text,
  name text,
  iban text,
  saldo_cents bigint,
  typ text not null default 'giro',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookkeeping_accounts_entity_idx
  on public.bookkeeping_accounts (billing_entity_id);
create unique index if not exists bookkeeping_accounts_iban_unique
  on public.bookkeeping_accounts (billing_entity_id, iban)
  where iban is not null;

create table if not exists public.bookkeeping_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_entity_id uuid not null references public.billing_entities(id) on delete cascade,
  konto_id uuid references public.bookkeeping_accounts(id) on delete set null,

  datum date not null,
  gegen text,
  zweck text,
  betrag_cents bigint not null,          -- > 0 Eingang, < 0 Ausgang

  kategorie_id text,
  konfidenz numeric(5, 2),
  status text not null default 'offen'
    check (status in ('offen', 'gebucht')),
  privatanteil numeric(5, 2) not null default 0,

  -- Abgleich (Phase 5): zugeordneter Beleg / zugeordnete Rechnung (als Zahlung).
  beleg_id uuid references public.bookkeeping_receipts(id) on delete set null,
  re_id uuid references public.invoices(id) on delete set null,
  beleg_nicht_noetig boolean not null default false,

  notiz text,
  import_hash text,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookkeeping_transactions_entity_idx
  on public.bookkeeping_transactions (billing_entity_id, datum desc);
create unique index if not exists bookkeeping_transactions_hash_unique
  on public.bookkeeping_transactions (billing_entity_id, import_hash)
  where import_hash is not null;

alter table public.bookkeeping_accounts     enable row level security;
alter table public.bookkeeping_transactions enable row level security;

create policy bookkeeping_accounts_select on public.bookkeeping_accounts
  for select using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );
create policy bookkeeping_accounts_write on public.bookkeeping_accounts
  for all using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  ) with check (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );

create policy bookkeeping_transactions_select on public.bookkeeping_transactions
  for select using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );
create policy bookkeeping_transactions_write on public.bookkeeping_transactions
  for all using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  ) with check (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );

create trigger bookkeeping_accounts_set_updated_at
  before update on public.bookkeeping_accounts
  for each row execute function public.set_updated_at();
create trigger bookkeeping_transactions_set_updated_at
  before update on public.bookkeeping_transactions
  for each row execute function public.set_updated_at();
