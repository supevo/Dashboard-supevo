-- =============================================================================
-- Migration 0034 – Marketing reports (weekly client reports)
--
-- The agency authors a periodic report per client (e.g. weekly) with free-text
-- sections for SEO/Ranking, SEA and inquiries plus a summary, and optional
-- screenshot image URLs. Published reports are visible to the client in the
-- portal. Task/time data still comes from the existing monthly report.
-- =============================================================================

create table if not exists public.marketing_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  period_label text not null,
  period_start date not null,
  ranking text,
  sea text,
  inquiries text,
  summary text,
  screenshots jsonb not null default '[]'::jsonb, -- [{ url, caption }]
  published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_reports_company_idx
  on public.marketing_reports (client_company_id, period_start desc);

alter table public.marketing_reports enable row level security;

-- Agency staff of the org see all reports; clients see only published ones.
create policy marketing_reports_select on public.marketing_reports
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or (published and client_company_id in (select public.current_user_client_company_ids()))
    or public.is_super_admin()
  );

-- Only agency staff of the org may create/update/delete.
create policy marketing_reports_insert on public.marketing_reports
  for insert with check (
    public.is_agency_staff() and organization_id in (select public.current_user_org_ids())
  );
create policy marketing_reports_update on public.marketing_reports
  for update using (
    public.is_agency_staff() and organization_id in (select public.current_user_org_ids())
  )
  with check (
    public.is_agency_staff() and organization_id in (select public.current_user_org_ids())
  );
create policy marketing_reports_delete on public.marketing_reports
  for delete using (
    public.is_agency_staff() and organization_id in (select public.current_user_org_ids())
  );

create trigger marketing_reports_set_updated_at
  before update on public.marketing_reports
  for each row execute function public.set_updated_at();
