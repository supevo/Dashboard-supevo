-- =============================================================================
-- Migration 0188 – Mitgliedschaften: Kündigung/Verlängerung + Zahlungseingang
--
-- Ergänzt die Mitgliedschafts-Übersicht:
--   * auto_renew / notice_period_months  – automatische Verlängerung nach der
--     Mindestlaufzeit und Kündigungsfrist (für „nächster Kündigungstermin").
--   * membership_payment_marks           – pro Kunde und Monat abhaken, dass die
--     Zahlung (z. B. SEPA-Lastschrift) eingegangen/abgebucht ist.
-- =============================================================================

-- --- Kündigung & Verlängerung -----------------------------------------------
alter table public.client_memberships
  add column if not exists auto_renew boolean not null default false,
  add column if not exists notice_period_months integer;

comment on column public.client_memberships.auto_renew is
  'Verlängert sich der Vertrag nach Ablauf der Mindestlaufzeit automatisch um die Laufzeit?';
comment on column public.client_memberships.notice_period_months is
  'Kündigungsfrist in Monaten vor Laufzeitende (NULL = keine feste Frist).';

-- --- Zahlungseingang je Monat abhaken ---------------------------------------
create table if not exists public.membership_payment_marks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  -- Abrechnungsmonat als 'YYYY-MM'.
  period text not null,
  collected_at timestamptz not null default now(),
  collected_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (client_company_id, period)
);

create index if not exists membership_payment_marks_org_period_idx
  on public.membership_payment_marks (organization_id, period);

alter table public.membership_payment_marks enable row level security;

-- Lesen + Schreiben für Agentur-Mitarbeiter der eigenen Org (Muster wie 0170).
drop policy if exists membership_payment_marks_rw on public.membership_payment_marks;
create policy membership_payment_marks_rw on public.membership_payment_marks
  for all using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  ) with check (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

notify pgrst, 'reload schema';
