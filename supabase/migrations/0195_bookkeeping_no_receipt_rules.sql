-- =============================================================================
-- Migration 0195 – Buchhaltung: gelernte „kein Beleg nötig"-Regeln
--
-- Markiert der Nutzer einen Bankumsatz als „kein Beleg nötig" (mit Grund),
-- merkt sich das System „Gegenpartei (normalisiert) → Grund" je Firma. Künftige
-- Umsätze desselben Empfängers/Zahlers (z. B. Finanzamt, Bankgebühr) werden
-- dann als Vorschlag angeboten: „wie früher: kein Beleg nötig (<Grund>)".
-- match_key ist der normalisierte gegen-Name (wie bei den Kategorie-Regeln).
-- =============================================================================

create table if not exists public.bookkeeping_no_receipt_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_entity_id uuid not null references public.billing_entities(id) on delete cascade,
  match_key text not null,
  grund text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (billing_entity_id, match_key)
);

create index if not exists bookkeeping_no_receipt_rules_entity_idx
  on public.bookkeeping_no_receipt_rules (billing_entity_id);

alter table public.bookkeeping_no_receipt_rules enable row level security;

drop policy if exists bookkeeping_no_receipt_rules_select on public.bookkeeping_no_receipt_rules;
create policy bookkeeping_no_receipt_rules_select on public.bookkeeping_no_receipt_rules
  for select using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );
drop policy if exists bookkeeping_no_receipt_rules_write on public.bookkeeping_no_receipt_rules;
create policy bookkeeping_no_receipt_rules_write on public.bookkeeping_no_receipt_rules
  for all using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  ) with check (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );

drop trigger if exists bookkeeping_no_receipt_rules_set_updated_at
  on public.bookkeeping_no_receipt_rules;
create trigger bookkeeping_no_receipt_rules_set_updated_at
  before update on public.bookkeeping_no_receipt_rules
  for each row execute function public.set_updated_at();
