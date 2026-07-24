-- =============================================================================
-- Migration 0010 – Billing & memberships
--
-- Adds the company/invoice/SEPA settings, per-client memberships (tied to the
-- existing Stage concept), and invoices + line items. All money is stored as
-- integer cents. RLS: agency org-admins manage everything; clients may read
-- their own membership and their non-draft invoices.
-- =============================================================================

-- --- enums -------------------------------------------------------------------
do $$ begin
  create type public.membership_payment_method as enum ('sepa', 'transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.membership_billing_status as enum ('active', 'paused', 'canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_status as enum ('draft', 'finalized', 'sent', 'paid', 'void');
exception when duplicate_object then null; end $$;

-- --- billing settings (one row per organization) -----------------------------
create table if not exists public.billing_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  company_name text,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text not null default 'Deutschland',
  vat_id text,               -- USt-IdNr.
  tax_number text,           -- Steuernummer
  contact_email text,
  phone text,
  website text,
  iban text,
  bic text,
  bank_name text,
  creditor_id text,          -- SEPA Gläubiger-Identifikationsnummer
  logo_path text,
  invoice_prefix text not null default '',
  invoice_next_number integer not null default 1,
  invoice_reset_yearly boolean not null default true,
  invoice_number_year integer,
  invoice_number_padding integer not null default 4,
  default_tax_rate numeric(5, 2) not null default 19.00,
  small_business boolean not null default false,  -- §19 UStG
  payment_terms_text text not null default 'Zahlbar sofort ohne Abzug.',
  invoice_footer text,
  stage1_name text not null default 'Mitgliedschaft',
  stage1_net_cents bigint not null default 0,
  stage2_name text not null default 'Mitgliedschaft Pro',
  stage2_net_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --- client memberships (one active membership per client) -------------------
create table if not exists public.client_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  stage smallint not null default 1 check (stage in (1, 2)),
  -- custom_net_cents null => use the stage price from billing_settings.
  custom_name text,
  custom_net_cents bigint,
  interval_months smallint not null default 1 check (interval_months in (1, 3, 12)),
  billing_day smallint not null default 15 check (billing_day between 1 and 28),
  payment_method public.membership_payment_method not null default 'sepa',
  status public.membership_billing_status not null default 'active',
  start_date date not null default current_date,
  next_invoice_date date,
  auto_send boolean not null default false,
  -- SEPA mandate (payer)
  mandate_reference text,
  mandate_date date,
  debtor_iban text,
  debtor_bic text,
  -- billing address (payer / client)
  billing_name text,
  billing_address_line1 text,
  billing_address_line2 text,
  billing_postal_code text,
  billing_city text,
  billing_country text not null default 'Deutschland',
  billing_vat_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_company_id)
);
create index if not exists client_memberships_org_idx
  on public.client_memberships (organization_id);
create index if not exists client_memberships_due_idx
  on public.client_memberships (next_invoice_date)
  where status = 'active';

-- --- invoices ----------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete restrict,
  membership_id uuid references public.client_memberships(id) on delete set null,
  invoice_number text,        -- assigned on finalize (gapless per org)
  status public.invoice_status not null default 'draft',
  issue_date date,
  service_period_start date,
  service_period_end date,
  due_date date,
  currency text not null default 'EUR',
  net_cents bigint not null default 0,
  tax_rate numeric(5, 2) not null default 19.00,
  tax_cents bigint not null default 0,
  gross_cents bigint not null default 0,
  payment_method public.membership_payment_method,
  pdf_path text,
  notes text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoices_org_idx
  on public.invoices (organization_id, created_at desc);
create index if not exists invoices_client_idx
  on public.invoices (client_company_id);
create unique index if not exists invoices_number_unique
  on public.invoices (organization_id, invoice_number)
  where invoice_number is not null;

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  position integer not null default 0,
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit_net_cents bigint not null default 0,
  tax_rate numeric(5, 2) not null default 19.00,
  net_cents bigint not null default 0
);
create index if not exists invoice_items_invoice_idx
  on public.invoice_items (invoice_id);

-- --- updated_at triggers -----------------------------------------------------
create trigger billing_settings_set_updated_at
  before update on public.billing_settings
  for each row execute function public.set_updated_at();
create trigger client_memberships_set_updated_at
  before update on public.client_memberships
  for each row execute function public.set_updated_at();
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.billing_settings   enable row level security;
alter table public.client_memberships enable row level security;
alter table public.invoices           enable row level security;
alter table public.invoice_items      enable row level security;

-- billing_settings: org admins only (contains bank data).
create policy billing_settings_select on public.billing_settings
  for select using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );
create policy billing_settings_write on public.billing_settings
  for all using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  ) with check (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );

-- client_memberships: agency staff of the org read all; clients read their own.
create policy client_memberships_select on public.client_memberships
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or client_company_id in (select public.current_user_client_company_ids())
    or public.is_super_admin()
  );
create policy client_memberships_write on public.client_memberships
  for all using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  ) with check (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );

-- invoices: agency staff read all in their org; clients read their non-drafts.
create policy invoices_select on public.invoices
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or (status <> 'draft' and client_company_id in (select public.current_user_client_company_ids()))
    or public.is_super_admin()
  );
create policy invoices_write on public.invoices
  for all using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  ) with check (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );

-- invoice_items follow their invoice's visibility.
create policy invoice_items_select on public.invoice_items
  for select using (
    exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id)
  );
create policy invoice_items_write on public.invoice_items
  for all using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and (public.is_org_admin(i.organization_id) or public.is_super_admin())
    )
  ) with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and (public.is_org_admin(i.organization_id) or public.is_super_admin())
    )
  );
