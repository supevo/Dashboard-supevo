-- =============================================================================
-- Migration 0118 – Buchhaltung: gelernte Kategorie-Regeln
--
-- Wählt der Nutzer für einen Bankumsatz eine Kategorie, merkt sich das System
-- „Gegenpartei (normalisiert) → Kategorie" je Firma. Künftige Umsätze desselben
-- Empfängers/Zahlers werden automatisch genauso kategorisiert (beim Import und
-- beim Auto-Kategorisieren). match_key ist der normalisierte gegen-Name.
-- =============================================================================

create table if not exists public.bookkeeping_category_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_entity_id uuid not null references public.billing_entities(id) on delete cascade,
  match_key text not null,
  kategorie_id text not null,
  hits integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (billing_entity_id, match_key)
);

create index if not exists bookkeeping_category_rules_entity_idx
  on public.bookkeeping_category_rules (billing_entity_id);

alter table public.bookkeeping_category_rules enable row level security;

create policy bookkeeping_category_rules_select on public.bookkeeping_category_rules
  for select using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );
create policy bookkeeping_category_rules_write on public.bookkeeping_category_rules
  for all using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  ) with check (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );

create trigger bookkeeping_category_rules_set_updated_at
  before update on public.bookkeeping_category_rules
  for each row execute function public.set_updated_at();
