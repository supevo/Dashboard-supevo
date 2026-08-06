-- =============================================================================
-- Migration 0103 – OneDrive-Anbindung (persönliches OneDrive, delegiert)
--
-- Eine Verbindung je Organisation: der Inhaber verbindet sein persönliches
-- OneDrive einmalig per OAuth; nur das (verschlüsselte) Refresh-Token wird
-- gespeichert. Zusätzlich eine Zuordnung Kundenfirma → OneDrive-Ordner, damit
-- Uploads automatisch in den passenden Kundenordner gespiegelt werden und der
-- Ordner im Task durchsucht werden kann.
-- =============================================================================

create table if not exists public.onedrive_connections (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  connected_by uuid references auth.users(id) on delete set null,
  account_label text,
  -- AES-256-GCM-verschlüsseltes Refresh-Token (Secret-Vault-Format).
  refresh_token_enc text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.onedrive_connections enable row level security;

-- Nur Org-Admins dürfen die Verbindung sehen/verwalten (das Token selbst wird
-- ohnehin nur serverseitig entschlüsselt).
create policy onedrive_conn_admin on public.onedrive_connections
  for all
  using (
    public.is_org_admin(organization_id)
    and organization_id in (select public.current_user_org_ids())
  )
  with check (
    public.is_org_admin(organization_id)
    and organization_id in (select public.current_user_org_ids())
  );

create table if not exists public.onedrive_folder_map (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  folder_id text not null,
  folder_path text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, client_company_id)
);

alter table public.onedrive_folder_map enable row level security;

-- Agentur-Team der Org darf die Zuordnung lesen (für Browse/Anhängen),
-- Org-Admins dürfen sie setzen.
create policy onedrive_map_read on public.onedrive_folder_map
  for select
  using (
    public.is_agency_staff()
    and organization_id in (select public.current_user_org_ids())
  );

create policy onedrive_map_write on public.onedrive_folder_map
  for all
  using (
    public.is_org_admin(organization_id)
    and organization_id in (select public.current_user_org_ids())
  )
  with check (
    public.is_org_admin(organization_id)
    and organization_id in (select public.current_user_org_ids())
  );
