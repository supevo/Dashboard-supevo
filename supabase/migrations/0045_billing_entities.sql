-- =============================================================================
-- Migration 0045 – Multiple billing entities (Rechnungssteller)
--
-- An organization can issue invoices from more than one legal entity (e.g.
-- "supevo GmbH" and "ONE STEP marketing"). Each entity has its own sender
-- details, own gapless invoice number sequence, own bank/SEPA data, logo and
-- membership prices. Each client is assigned to one entity; invoices carry the
-- entity so the PDF sender + number sequence come from it.
--
-- billing_entities mirrors billing_settings' columns exactly (same names) so
-- the PDF/footer code keeps working unchanged. The existing billing_settings
-- row is migrated into a default entity per org; clients + invoices are linked
-- to it. billing_settings stays for backward data but is no longer authoritative.
-- =============================================================================

create table if not exists public.billing_entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,                    -- internal label, e.g. "supevo GmbH"
  is_default boolean not null default false,
  -- --- mirror of billing_settings (same column names) ---
  company_name text,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text not null default 'Deutschland',
  vat_id text,
  tax_number text,
  contact_email text,
  phone text,
  website text,
  iban text,
  bic text,
  bank_name text,
  creditor_id text,
  logo_path text,
  invoice_prefix text not null default '',
  invoice_next_number integer not null default 1,
  invoice_reset_yearly boolean not null default true,
  invoice_number_year integer,
  invoice_number_padding integer not null default 4,
  default_tax_rate numeric(5, 2) not null default 19.00,
  small_business boolean not null default false,
  payment_terms_text text not null default 'Zahlbar sofort ohne Abzug.',
  invoice_footer text,
  stage1_name text not null default 'Mitgliedschaft',
  stage1_net_cents bigint not null default 0,
  stage2_name text not null default 'Mitgliedschaft Pro',
  stage2_net_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists billing_entities_org_idx
  on public.billing_entities (organization_id);

alter table public.billing_entities enable row level security;

create policy billing_entities_select on public.billing_entities
  for select using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );
create policy billing_entities_write on public.billing_entities
  for all using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  ) with check (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );

create trigger billing_entities_set_updated_at
  before update on public.billing_entities
  for each row execute function public.set_updated_at();

-- Seed one default entity per org from the current billing_settings.
insert into public.billing_entities (
  organization_id, name, is_default,
  company_name, address_line1, address_line2, postal_code, city, country,
  vat_id, tax_number, contact_email, phone, website,
  iban, bic, bank_name, creditor_id, logo_path,
  invoice_prefix, invoice_next_number, invoice_reset_yearly, invoice_number_year,
  invoice_number_padding, default_tax_rate, small_business, payment_terms_text,
  invoice_footer, stage1_name, stage1_net_cents, stage2_name, stage2_net_cents
)
select
  organization_id, coalesce(nullif(company_name, ''), 'Standard'), true,
  company_name, address_line1, address_line2, postal_code, city, country,
  vat_id, tax_number, contact_email, phone, website,
  iban, bic, bank_name, creditor_id, logo_path,
  invoice_prefix, invoice_next_number, invoice_reset_yearly, invoice_number_year,
  invoice_number_padding, default_tax_rate, small_business, payment_terms_text,
  invoice_footer, stage1_name, stage1_net_cents, stage2_name, stage2_net_cents
from public.billing_settings
on conflict do nothing;

-- Link clients + invoices to an entity.
alter table public.client_companies
  add column if not exists billing_entity_id uuid references public.billing_entities(id) on delete set null;
alter table public.invoices
  add column if not exists billing_entity_id uuid references public.billing_entities(id) on delete set null;

-- Backfill everything to the org's default entity.
update public.client_companies c
set billing_entity_id = e.id
from public.billing_entities e
where e.organization_id = c.organization_id
  and e.is_default
  and c.billing_entity_id is null;

update public.invoices i
set billing_entity_id = e.id
from public.billing_entities e
where e.organization_id = i.organization_id
  and e.is_default
  and i.billing_entity_id is null;
