-- =============================================================================
-- Migration 0092 – Passwortmanager (Team-Tresor)
--
-- Geteilter Passwort-Tresor der Agentur. Das Passwort selbst liegt AES-256-GCM-
-- verschlüsselt (secret_encrypted, Schlüssel aus SECRET_ENCRYPTION_KEY, nie in
-- der DB). Kategorie wird von der KI anhand des Titels vergeben. Zugriff nur für
-- Agentur-Mitarbeiter der Organisation.
-- =============================================================================

create table if not exists public.password_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  username text,
  secret_encrypted text,
  url text,
  notes text,
  category text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists password_entries_org_idx
  on public.password_entries (organization_id, category);

alter table public.password_entries enable row level security;

-- Agency staff of the org share the vault (read + write).
create policy password_entries_all on public.password_entries
  for all
  using (
    public.is_agency_staff()
    and organization_id in (select public.current_user_org_ids())
  )
  with check (
    public.is_agency_staff()
    and organization_id in (select public.current_user_org_ids())
  );

create trigger password_entries_set_updated_at
  before update on public.password_entries
  for each row execute function public.set_updated_at();
