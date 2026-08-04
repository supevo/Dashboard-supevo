-- =============================================================================
-- Migration 0084 – Employee HR / payroll profile
--
-- Personal + payroll master data each employee maintains themselves, so the
-- agency (and its tax advisor) has everything needed for Lohnabrechnungen:
-- address, birth data, tax ID, tax class, social-security number, health
-- insurance, bank details, etc.
--
-- Sensitive PII → strict RLS:
--   * the employee reads and writes ONLY their own row,
--   * org admins / super_admin may READ their org's rows (to hand the data to
--     the Steuerberater) but not write them,
--   * nobody else (other employees, clients) can see any of it.
-- One row per user (user_id is the primary key).
-- =============================================================================

create table if not exists public.employee_hr_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Person
  date_of_birth date,
  place_of_birth text,
  nationality text,
  marital_status text,          -- Familienstand
  private_phone text,

  -- Address
  address_street text,
  address_house_no text,
  address_zip text,
  address_city text,
  address_country text default 'Deutschland',

  -- Tax
  tax_id text,                  -- Steuerliche Identifikationsnummer (11-stellig)
  tax_class text,               -- Steuerklasse I–VI
  child_allowances numeric(4,1),-- Kinderfreibeträge
  religious_affiliation text,   -- Konfession (Kirchensteuer)

  -- Social security / insurance
  social_security_number text,  -- Sozialversicherungs-/Rentenversicherungsnummer
  health_insurance text,        -- Krankenkasse
  severely_disabled boolean not null default false, -- Schwerbehinderung

  -- Bank (salary)
  iban text,
  bic text,
  account_holder text,          -- Kontoinhaber, falls abweichend

  notes text,                   -- Sonstiges für die Lohnabrechnung
  updated_at timestamptz not null default now()
);

create index if not exists employee_hr_profiles_org_idx
  on public.employee_hr_profiles (organization_id);

alter table public.employee_hr_profiles enable row level security;

-- Read: the person themselves, or an org admin / super_admin of the row's org.
create policy employee_hr_profiles_select on public.employee_hr_profiles
  for select using (
    user_id = auth.uid()
    or public.is_org_admin(organization_id)
  );

-- Insert: only your own row, scoped to an org you belong to.
create policy employee_hr_profiles_insert on public.employee_hr_profiles
  for insert with check (
    user_id = auth.uid()
    and organization_id in (select public.current_user_org_ids())
  );

-- Update: only your own row.
create policy employee_hr_profiles_update on public.employee_hr_profiles
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
