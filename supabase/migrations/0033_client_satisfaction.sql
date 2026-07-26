-- =============================================================================
-- Migration 0033 – Client satisfaction (monthly CSAT)
--
-- A client contact rates their experience once per month (1–5) with an optional
-- comment. Agency staff see the aggregate per client; the client sees/edits
-- their own current entry. One row per company per month.
-- =============================================================================

create table if not exists public.client_satisfaction (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  month date not null, -- first day of the month
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_company_id, month)
);
create index if not exists client_satisfaction_org_idx
  on public.client_satisfaction (organization_id, month desc);
create index if not exists client_satisfaction_company_idx
  on public.client_satisfaction (client_company_id, month desc);

alter table public.client_satisfaction enable row level security;

-- Agency staff of the org and the client's own contacts may read.
create policy client_satisfaction_select on public.client_satisfaction
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or client_company_id in (select public.current_user_client_company_ids())
    or public.is_super_admin()
  );

-- Only a contact of the company may create/update its rating.
create policy client_satisfaction_insert on public.client_satisfaction
  for insert with check (
    client_company_id in (select public.current_user_client_company_ids())
  );
create policy client_satisfaction_update on public.client_satisfaction
  for update using (
    client_company_id in (select public.current_user_client_company_ids())
  )
  with check (
    client_company_id in (select public.current_user_client_company_ids())
  );

create trigger client_satisfaction_set_updated_at
  before update on public.client_satisfaction
  for each row execute function public.set_updated_at();
