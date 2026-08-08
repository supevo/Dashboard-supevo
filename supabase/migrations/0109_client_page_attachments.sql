-- =============================================================================
-- Migration 0109 – Client page attachments (files / photos on internal pages)
--
-- Files attached to an internal client page. Bytes live in the existing `files`
-- storage bucket; this table holds the metadata. Team-internal (agency staff).
-- =============================================================================

create table if not exists public.client_page_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  page_id uuid not null references public.client_pages(id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  storage_path text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists client_page_attachments_page_idx
  on public.client_page_attachments (page_id, created_at);

alter table public.client_page_attachments enable row level security;

create policy client_page_attachments_select on public.client_page_attachments
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create policy client_page_attachments_insert on public.client_page_attachments
  for insert with check (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create policy client_page_attachments_delete on public.client_page_attachments
  for delete using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
