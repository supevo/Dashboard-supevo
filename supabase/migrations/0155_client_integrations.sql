-- Externe Daten-Integrationen je Kunde (Start: Google Search Console).
-- Der Refresh-Token wird VERSCHLÜSSELT gespeichert (secret-vault, AES-256-GCM);
-- Zugriff ausschließlich über den Service-Client in autorisiertem Server-Code.
set lock_timeout = '5s';

create table if not exists public.client_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  provider text not null,
  refresh_token_enc text,
  site_url text,
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_company_id, provider)
);

create index if not exists client_integrations_org_idx
  on public.client_integrations (organization_id);

-- RLS aktiv, aber ohne permissive Policies: Nur der Service-Client (in
-- autorisiertem Server-Code) darf lesen/schreiben – niemand über die Anon-/
-- User-Rolle. So kann ein verschlüsselter Token nie versehentlich an den Client
-- gelangen.
alter table public.client_integrations enable row level security;
