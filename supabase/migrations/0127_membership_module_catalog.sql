-- =============================================================================
-- 0127 – Mitgliedschafts-Modulkatalog im Backend verwaltbar
-- Kategorien + Module je Organisation, damit Preise/Module ohne Deploy im
-- Backend gepflegt werden können. Wird mit den bisherigen Code-Modulen
-- vorbefüllt (gleiche keys → bestehende Angebote/Mitgliedschaften bleiben gültig).
-- =============================================================================

create table if not exists public.membership_module_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.membership_modules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.membership_module_categories(id) on delete set null,
  -- stabiler Schlüssel für gespeicherte Auswahlen (z. B. 'web_paket').
  key text not null,
  label text not null,
  description text not null default '',
  -- 'flat' | 'per_unit' | 'stage'
  pricing_kind text not null default 'flat'
    check (pricing_kind in ('flat', 'per_unit', 'stage')),
  net_cents integer not null default 0,
  unit_label text,
  default_qty integer not null default 1,
  min_qty integer not null default 0,
  max_qty integer not null default 99,
  -- nur bei pricing_kind='stage': 1 oder 2 (Preis kommt aus billing_settings).
  stage smallint,
  capture_budget boolean not null default false,
  position double precision not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);
create index if not exists membership_modules_org_idx
  on public.membership_modules (organization_id, position);

alter table public.membership_module_categories enable row level security;
alter table public.membership_modules enable row level security;

drop policy if exists membership_module_categories_all on public.membership_module_categories;
create policy membership_module_categories_all on public.membership_module_categories
  for all using (public.is_org_admin(organization_id) or public.is_super_admin())
  with check (public.is_org_admin(organization_id) or public.is_super_admin());

drop policy if exists membership_modules_all on public.membership_modules;
create policy membership_modules_all on public.membership_modules
  for all using (public.is_org_admin(organization_id) or public.is_super_admin())
  with check (public.is_org_admin(organization_id) or public.is_super_admin());

drop trigger if exists membership_module_categories_set_updated_at
  on public.membership_module_categories;
create trigger membership_module_categories_set_updated_at
  before update on public.membership_module_categories
  for each row execute function public.set_updated_at();
drop trigger if exists membership_modules_set_updated_at on public.membership_modules;
create trigger membership_modules_set_updated_at
  before update on public.membership_modules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Startbefüllung: pro Organisation die bisherigen Module + Kategorien anlegen.
-- Idempotent über die unique-Constraints (on conflict do nothing).
-- ---------------------------------------------------------------------------
do $$
declare
  o record;
  c_supevo uuid; c_web uuid; c_seo uuid; c_ads uuid;
begin
  for o in select id from public.organizations loop
    insert into public.membership_module_categories (organization_id, name, position)
    values (o.id, 'supevo', 0), (o.id, 'Web', 1), (o.id, 'SEO', 2), (o.id, 'Ads', 3)
    on conflict (organization_id, name) do nothing;

    select id into c_supevo from public.membership_module_categories
      where organization_id = o.id and name = 'supevo';
    select id into c_web from public.membership_module_categories
      where organization_id = o.id and name = 'Web';
    select id into c_seo from public.membership_module_categories
      where organization_id = o.id and name = 'SEO';
    select id into c_ads from public.membership_module_categories
      where organization_id = o.id and name = 'Ads';

    insert into public.membership_modules
      (organization_id, category_id, key, label, description, pricing_kind,
       net_cents, unit_label, default_qty, min_qty, max_qty, stage, capture_budget, position)
    values
      (o.id, c_supevo, 'supevo_stage1', 'supevo Mitgliedschaft – Stage 1',
       'Große supevo-Mitgliedschaft, Stufe 1 (Preis aus Billing-Einstellungen).',
       'stage', 0, null, 1, 0, 1, 1, false, 0),
      (o.id, c_supevo, 'supevo_stage2', 'supevo Mitgliedschaft – Stage 2',
       'Große supevo-Mitgliedschaft, Stufe 2 (Preis aus Billing-Einstellungen).',
       'stage', 0, null, 1, 0, 1, 2, false, 1),
      (o.id, c_web, 'web_paket', 'Web-Paket',
       'Website inkl. laufender Bereitstellung.',
       'flat', 34000, null, 1, 0, 1, null, false, 2),
      (o.id, c_web, 'wartung', 'Wartung & Hosting',
       'Laufende Wartung, Updates, Hosting.',
       'flat', 4900, null, 1, 0, 1, null, false, 3),
      (o.id, c_seo, 'seo_beitraege', 'SEO-Beiträge',
       'Regelmäßige SEO-Beiträge pro Monat.',
       'per_unit', 8000, 'Beiträge/Monat', 4, 0, 30, null, false, 4),
      (o.id, c_ads, 'google_ads', 'Google Ads Betreuung',
       'Betreuungspauschale. Das Werbebudget zahlt der Kunde direkt an Google (fließt nicht in den Mitgliedspreis).',
       'flat', 24500, null, 1, 0, 1, null, true, 5)
    on conflict (organization_id, key) do nothing;
  end loop;
end $$;
