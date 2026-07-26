-- =============================================================================
-- Migration 0022 – Leads (lightweight CRM for incoming inquiries)
--
-- Prospective clients / inquiries the agency tracks through a simple pipeline
-- (neu → kontaktiert → Angebot → gewonnen/verloren). Managed by agency staff
-- of the organization. Not visible to clients.
-- =============================================================================

do $$ begin
  create type public.lead_status as enum ('new', 'contacted', 'offer', 'won', 'lost');
exception when duplicate_object then null; end $$;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_name text not null,
  company text,
  email text,
  phone text,
  source text,
  note text,
  estimated_value_cents integer,
  status public.lead_status not null default 'new',
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_org_status_idx
  on public.leads (organization_id, status, created_at desc);

alter table public.leads enable row level security;

create policy leads_select on public.leads
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create policy leads_write on public.leads
  for all
  using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  )
  with check (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();
