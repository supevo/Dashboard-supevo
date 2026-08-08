-- =============================================================================
-- Migration 0107 – Client pages (internal notes / Notion-like pages per client)
--
-- A team-internal workspace per client: free-form pages and one level of
-- folders, used to draft SEO posts, notes and ideas and "bunker" them until
-- they are needed. Not exposed to clients (agency staff only).
-- =============================================================================

do $$ begin
  create type public.client_page_status as enum ('draft', 'ready', 'used', 'archived');
exception when duplicate_object then null; end $$;

create table if not exists public.client_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  -- One folder level: pages may hang under a folder (parent_id -> a folder row).
  parent_id uuid references public.client_pages(id) on delete cascade,
  is_folder boolean not null default false,
  title text not null,
  content text not null default '',
  status public.client_page_status not null default 'draft',
  position double precision not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_pages_company_idx
  on public.client_pages (client_company_id, position);
create index if not exists client_pages_parent_idx
  on public.client_pages (parent_id);

alter table public.client_pages enable row level security;

-- Team-internal: agency staff of the owning org manage everything; super admins
-- see all. Clients have no access (the table is never queried from the portal).
create policy client_pages_select on public.client_pages
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create policy client_pages_insert on public.client_pages
  for insert with check (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create policy client_pages_update on public.client_pages
  for update using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  )
  with check (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create policy client_pages_delete on public.client_pages
  for delete using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create trigger client_pages_set_updated_at
  before update on public.client_pages
  for each row execute function public.set_updated_at();
