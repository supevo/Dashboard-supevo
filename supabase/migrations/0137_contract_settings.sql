-- =============================================================================
-- 0137 – Vertragskonditionen je Organisation (im Backend editierbar)
-- Ein editierbarer Konditionstext pro Organisation, der im generierten Vertrag
-- als Rechtstext erscheint. Der Standardtext lebt im Code (DEFAULT_TERMS); leer
-- = Code-Default wird verwendet.
-- =============================================================================
create table if not exists public.contract_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  terms text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.contract_settings enable row level security;

drop policy if exists contract_settings_all on public.contract_settings;
create policy contract_settings_all on public.contract_settings
  for all using (public.is_org_admin(organization_id) or public.is_super_admin())
  with check (public.is_org_admin(organization_id) or public.is_super_admin());

drop trigger if exists contract_settings_set_updated_at on public.contract_settings;
create trigger contract_settings_set_updated_at
  before update on public.contract_settings
  for each row execute function public.set_updated_at();
