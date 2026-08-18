-- =============================================================================
-- 0141 – Kundendokumente (SEPA-Mandat, Vertrag)
-- Je Kunde + Art genau ein hinterlegtes Dokument: entweder hochgeladen
-- (Supabase Storage) oder als Referenz auf einen OneDrive-Ordner bzw. eine
-- OneDrive-Datei. Schreiben/Lesen im Code über den Service-Client nach einer
-- Agentur-Prüfung; RLS als Schutz (admin-only) für direkten Zugriff.
-- =============================================================================
create table if not exists public.client_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  kind text not null check (kind in ('sepa_mandate', 'contract')),
  source text not null check (source in ('upload', 'onedrive_folder', 'onedrive_file')),
  file_path text,            -- Storage-Pfad bei Upload
  onedrive_item_id text,     -- Item-ID bei OneDrive
  web_url text,              -- Öffnen-Link (OneDrive)
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (client_company_id, kind)
);
create index if not exists client_documents_client_idx
  on public.client_documents (client_company_id);

alter table public.client_documents enable row level security;

drop policy if exists client_documents_all on public.client_documents;
create policy client_documents_all on public.client_documents
  for all using (public.is_org_admin(organization_id) or public.is_super_admin())
  with check (public.is_org_admin(organization_id) or public.is_super_admin());

drop trigger if exists client_documents_set_updated_at on public.client_documents;
create trigger client_documents_set_updated_at
  before update on public.client_documents
  for each row execute function public.set_updated_at();
