-- =============================================================================
-- Migration 0069 – Submarken im Marken-Hub
--
-- Ein Kunde kann mehrere (Sub-)Marken führen. Assets (Logos, Guidelines,
-- Zugänge) lassen sich einer Marke zuordnen; brand_id = NULL bedeutet
-- „Allgemein" (kundenweit, keiner Marke zugeordnet).
--
-- RLS wie bei client_assets: agentur-only für den Direktzugriff. Der
-- Kundenzugriff (lesen + eigenes Befüllen) läuft über den Service-Client, nach
-- vorheriger Zugriffsprüfung in den Actions/Routes (resolveAssetAccess).
-- =============================================================================

create table if not exists public.client_brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists client_brands_company_idx
  on public.client_brands (client_company_id, name);

alter table public.client_brands enable row level security;

create policy client_brands_select on public.client_brands
  for select using (
    public.is_super_admin()
    or (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
  );

create policy client_brands_insert on public.client_brands
  for insert with check (
    public.is_agency_staff() and organization_id in (select public.current_user_org_ids())
  );

create policy client_brands_delete on public.client_brands
  for delete using (
    public.is_agency_staff() and organization_id in (select public.current_user_org_ids())
  );

-- Asset ↔ Marke (NULL = Allgemein). Wird eine Marke gelöscht, fallen ihre
-- Assets auf „Allgemein" zurück (set null), statt verloren zu gehen.
alter table public.client_assets
  add column if not exists brand_id uuid
    references public.client_brands(id) on delete set null;

create index if not exists client_assets_brand_idx
  on public.client_assets (brand_id);
