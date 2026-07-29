-- =============================================================================
-- Migration 0068 – Zentrales Asset-Hub pro Kunde
--
-- Ein fester Bereich, in dem Marken-Guidelines, finale Logos und Zugänge
-- dauerhaft hinterlegt sind.
--
--   category = 'guideline'  Marken-Guidelines (Datei oder Link) – Kunde sichtbar
--   category = 'logo'       finale Logos (Datei)                – Kunde sichtbar
--   category = 'access'     Zugänge (nur Verweis: Dienst, Login-URL, Benutzer,
--                           Link zum Passwort-Manager) – NUR Agentur, nie Kunde
--
-- Sicherheit: Es werden bewusst KEINE Passwörter gespeichert. Zugänge sind reine
-- Verweise (Login-URL + Benutzername + Link zum Passwort-Manager). Die Tabelle
-- ist agentur-only (RLS); der Kundenzugriff auf guideline/logo läuft über den
-- Service-Client nach vorheriger Kontakt-Prüfung in den Queries/Routes.
-- =============================================================================

create table if not exists public.client_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  category text not null check (category in ('guideline', 'logo', 'access')),
  title text not null,
  url text,           -- externer Link / Login-URL / Passwort-Manager-Link
  username text,      -- Benutzername/Login (nur category = 'access')
  notes text,
  storage_path text,  -- hochgeladene Datei (Logos/Guidelines)
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists client_assets_company_idx
  on public.client_assets (client_company_id, category, created_at);

alter table public.client_assets enable row level security;

-- Agentur-Mitarbeiter der Org verwalten alle Assets ihrer Org. Der Kundenzugriff
-- (nur guideline/logo) läuft über den Service-Client nach Kontakt-Prüfung.
create policy client_assets_select on public.client_assets
  for select using (
    public.is_super_admin()
    or (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
  );

create policy client_assets_insert on public.client_assets
  for insert with check (
    public.is_agency_staff() and organization_id in (select public.current_user_org_ids())
  );

create policy client_assets_update on public.client_assets
  for update using (
    public.is_agency_staff() and organization_id in (select public.current_user_org_ids())
  );

create policy client_assets_delete on public.client_assets
  for delete using (
    public.is_agency_staff() and organization_id in (select public.current_user_org_ids())
  );
