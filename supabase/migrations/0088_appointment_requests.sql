-- =============================================================================
-- Migration 0088 – Terminanfragen (Kunde schlägt vor, Agentur bestätigt)
--
-- Der Kunde schlägt bis zu drei Wunschtermine vor. Die Agentur bestätigt einen
-- davon → daraus wird automatisch ein Kalendereintrag, der Kunde wird
-- benachrichtigt. Kein Verfügbarkeits-Setup nötig.
--
-- Schreibzugriff über Server-Actions mit Service-Client nach In-Code-Prüfung;
-- daher nur eine SELECT-Policy (Agentur der Org oder Kontakt der Firma).
-- =============================================================================

create table if not exists public.appointment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  topic text not null,
  note text,
  opt1_date date not null,
  opt1_time text,
  opt2_date date,
  opt2_time text,
  opt3_date date,
  opt3_time text,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'declined')),
  confirmed_date date,
  confirmed_time text,
  confirmed_by uuid references public.profiles(id) on delete set null,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists appointment_requests_org_status_idx
  on public.appointment_requests (organization_id, status);

alter table public.appointment_requests enable row level security;

create policy appointment_requests_select on public.appointment_requests
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or exists (
      select 1 from public.client_contacts cc
      where cc.user_id = auth.uid()
        and cc.client_company_id = appointment_requests.client_company_id
    )
  );

-- Notification type for appointment updates. NOTE: an enum value cannot be added
-- and used in the same transaction — run this line on its own if your migration
-- runner wraps files in a transaction.
alter type public.notification_type add value if not exists 'appointment';
