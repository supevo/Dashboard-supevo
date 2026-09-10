-- =============================================================================
-- Migration 0198 – Ads-Abrechnung (Meta / Google), Phase 1
--
-- Wiederkehrende Anzeigen-Budgets, die die Agentur auslegt: pro Kunde + Plattform
-- ein „Mandat" (mit monatlicher Kundenpauschale). Weil die Plattform-Rechnungen
-- unzuverlässig/zeitversetzt sind, trägt der zuständige Mitarbeiter den monatlich
-- verbrauchten Betrag selbst ein (ads_monthly_entries) und hakt ab, ob der Monat
-- abgerechnet wurde. Erinnerungen laufen, bis der Monat erfasst/abgerechnet ist.
--
-- Schreibzugriff läuft über den Service-Client nach In-Code-Autorisierung – daher
-- nur SELECT-Policys (Agentur-Team der Organisation).
-- =============================================================================

create table if not exists public.ads_mandates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  platform text not null check (platform in ('meta', 'google')),
  monthly_fee_cents integer,
  responsible_user_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  started_month date,
  reminded_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_company_id, platform)
);
create index if not exists ads_mandates_org_idx on public.ads_mandates (organization_id);

create table if not exists public.ads_monthly_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mandate_id uuid not null references public.ads_mandates(id) on delete cascade,
  month date not null,
  spent_cents integer,
  billed boolean not null default false,
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mandate_id, month)
);
create index if not exists ads_monthly_entries_mandate_idx
  on public.ads_monthly_entries (mandate_id);

alter table public.tasks
  add column if not exists ads_billing_status text,
  add column if not exists ads_flagged_at timestamptz,
  add column if not exists ads_reminded_at timestamptz;

alter table public.ads_mandates enable row level security;
alter table public.ads_monthly_entries enable row level security;

drop policy if exists ads_mandates_select on public.ads_mandates;
create policy ads_mandates_select on public.ads_mandates
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

drop policy if exists ads_monthly_entries_select on public.ads_monthly_entries;
create policy ads_monthly_entries_select on public.ads_monthly_entries
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

drop trigger if exists ads_mandates_set_updated_at on public.ads_mandates;
create trigger ads_mandates_set_updated_at
  before update on public.ads_mandates
  for each row execute function public.set_updated_at();

drop trigger if exists ads_monthly_entries_set_updated_at on public.ads_monthly_entries;
create trigger ads_monthly_entries_set_updated_at
  before update on public.ads_monthly_entries
  for each row execute function public.set_updated_at();

-- SEPARAT ausführen (ALTER TYPE ... ADD VALUE darf nicht in derselben Transaktion
-- benutzt werden): Benachrichtigungstyp für die Ads-Erinnerung.
alter type public.notification_type add value if not exists 'ads_billing';
