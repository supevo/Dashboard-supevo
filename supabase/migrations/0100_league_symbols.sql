-- =============================================================================
-- Migration 0100 – Eigene Liga-Symbole je Organisation
--
-- Erlaubt es Admins, je Liga ein eigenes Symbol festzulegen: entweder ein Emoji
-- (symbol) oder ein hochgeladenes Bild (image_path im files-Bucket). Ist ein
-- Bild gesetzt, hat es Vorrang; sonst das Emoji; sonst das Standard-Emoji aus
-- dem Code.
-- =============================================================================

create table if not exists public.league_symbols (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  league_key text not null,
  symbol text,
  image_path text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, league_key)
);

alter table public.league_symbols enable row level security;

-- Agentur-Team der Org darf lesen (Anzeige im Level Hub etc.).
create policy league_symbols_read on public.league_symbols
  for select
  using (
    public.is_agency_staff()
    and organization_id in (select public.current_user_org_ids())
  );

-- Nur Org-Admins dürfen die Symbole pflegen.
create policy league_symbols_write on public.league_symbols
  for all
  using (
    public.is_org_admin(organization_id)
    and organization_id in (select public.current_user_org_ids())
  )
  with check (
    public.is_org_admin(organization_id)
    and organization_id in (select public.current_user_org_ids())
  );
