-- =============================================================================
-- Migration 0075 – Onboarding (Vertrag + SEPA-Mandat digital unterschreiben)
--
-- Der Kunde unterschreibt beim Onboarding den Dienstleistungsvertrag und das
-- SEPA-Mandat direkt in der App (Zeichenpad, Maus/Touch). Pro Unterschrift wird
-- ein PDF erzeugt (inkl. Signaturbild, Name, Zeitstempel, IP) und im
-- "files"-Bucket abgelegt; hier stehen nur Status + Pfade. Die IBAN wird
-- verschlüsselt gespeichert (AES, Secret-Vault), plus die letzten 4 Stellen.
-- =============================================================================

create table if not exists public.client_onboarding (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  contract_signed_at timestamptz,
  contract_signer text,
  contract_pdf_path text,
  sepa_signed_at timestamptz,
  sepa_signer text,
  sepa_account_holder text,
  sepa_iban_encrypted text,
  sepa_iban_last4 text,
  sepa_mandate_ref text,
  sepa_pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists client_onboarding_company_idx
  on public.client_onboarding (client_company_id);

alter table public.client_onboarding enable row level security;

create policy client_onboarding_admin_all on public.client_onboarding
  for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
