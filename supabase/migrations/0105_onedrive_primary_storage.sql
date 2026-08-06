-- =============================================================================
-- Migration 0105 – OneDrive als primärer Speicher für Aufgaben-Anhänge
--
-- Aufgaben-Anhänge können ausschließlich im OneDrive liegen (statt Supabase),
-- um Storage zu sparen. In der files-Tabelle steht dann nur die Referenz
-- (onedrive_item_id); storage_path bleibt null. Ein Schalter je Verbindung
-- aktiviert das; ein Sammelordner nimmt Anhänge ohne Kundenzuordnung auf.
-- Fehlgeschlagene OneDrive-Uploads werden protokolliert (Super-Admin-Anzeige).
-- =============================================================================

alter table public.files
  add column if not exists onedrive_item_id text;

-- OneDrive-Dateien haben keinen Supabase-Pfad.
alter table public.files
  alter column storage_path drop not null;

alter table public.onedrive_connections
  add column if not exists primary_attachments boolean not null default false;
alter table public.onedrive_connections
  add column if not exists collection_folder_path text;

create table if not exists public.onedrive_upload_errors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid references public.client_companies(id) on delete set null,
  file_name text,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists onedrive_upload_errors_org_idx
  on public.onedrive_upload_errors (organization_id, created_at desc);

alter table public.onedrive_upload_errors enable row level security;

-- Nur Org-Admins/Super-Admins der Org sehen die Fehlerliste.
create policy onedrive_errors_admin_read on public.onedrive_upload_errors
  for select
  using (
    public.is_org_admin(organization_id)
    and organization_id in (select public.current_user_org_ids())
  );
