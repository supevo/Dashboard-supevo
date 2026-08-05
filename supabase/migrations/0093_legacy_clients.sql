-- =============================================================================
-- Migration 0093 – Legacy Kunden (Bestandskunden mit Paketen)
--
-- Legacy-Kunden sind Bestandskunden mit einem festen Website-/Betreuungspaket.
-- Sie funktionieren wie normale Kunden (gleiche Kanbans, gleiche Projekte),
-- werden in der Projektübersicht aber separat und kleiner angezeigt.
--
-- `is_legacy` markiert den Kunden. `legacy_client_settings` hält das gewählte
-- Paket, einen optionalen frei eingetragenen Preis (für ausgehandelte Rabatte)
-- und – nur für Performance – die separat getragenen Werbebudgets (Google Ads /
-- Meta). Werbebudgets sind NICHT Teil des Paketpreises.
-- =============================================================================

alter table public.client_companies
  add column if not exists is_legacy boolean not null default false;

create table if not exists public.legacy_client_settings (
  client_company_id uuid primary key
    references public.client_companies(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Paket: care | website | growth | performance
  package text not null default 'care'
    check (package in ('care', 'website', 'growth', 'performance')),
  -- Frei eingetragener Nettopreis in Cent (überschreibt den Paket-Standardpreis,
  -- z. B. für ausgehandelte Rabatte). NULL = Paket-Standardpreis.
  custom_price_cents integer check (custom_price_cents is null or custom_price_cents >= 0),
  -- Nur relevant für das Performance-Paket. Werbebudget in Cent, vom Kunden
  -- separat getragen. NULL = nicht vereinbart / nicht aktiv.
  google_ads_budget_cents integer check (google_ads_budget_cents is null or google_ads_budget_cents >= 0),
  meta_budget_cents integer check (meta_budget_cents is null or meta_budget_cents >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists legacy_client_settings_org_idx
  on public.legacy_client_settings (organization_id);

alter table public.legacy_client_settings enable row level security;

-- Agentur-Team der Organisation darf lesen (Paket in der Übersicht).
create policy legacy_client_settings_read on public.legacy_client_settings
  for select
  using (
    public.is_agency_staff()
    and organization_id in (select public.current_user_org_ids())
  );

-- Nur Org-Admins dürfen Paket/Preis/Budget pflegen.
create policy legacy_client_settings_write on public.legacy_client_settings
  for all
  using (
    public.is_org_admin()
    and organization_id in (select public.current_user_org_ids())
  )
  with check (
    public.is_org_admin()
    and organization_id in (select public.current_user_org_ids())
  );

create trigger legacy_client_settings_set_updated_at
  before update on public.legacy_client_settings
  for each row execute function public.set_updated_at();
