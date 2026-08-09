-- =============================================================================
-- Migration 0115 – Buchhaltung: Belege + Import-Log
--
-- Belege (Rechnungen/Quittungen) liegen in OneDrive (Einnahmen-/Ausgaben-Ordner
-- je Firma, siehe accounting_profiles). Dieses Modul zieht sie inkrementell ins
-- System: pro Beleg ein bookkeeping_receipts-Eintrag mit der OneDrive-item_id
-- als Dedup-Schlüssel (derselbe Ordner kann mehrfach gescannt werden, ohne
-- doppelt zu importieren). Die eigentlichen Dateien bleiben in OneDrive (Quelle
-- der Wahrheit); hier stehen nur Metadaten + später die per KI ausgelesenen
-- Felder (erkannt jsonb). bookkeeping_import_log hält fest, was wann aus welchem
-- Ordner gezogen wurde, damit ein schrittweiser Backfill nachvollziehbar bleibt.
--
-- Alles trägt billing_entity_id als Trennschlüssel → getrennte Bücher je Firma.
-- Zugriff intern (Org-Admins/Super-Admin), wie billing_entities/accounting.
-- =============================================================================

create table if not exists public.bookkeeping_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_entity_id uuid not null references public.billing_entities(id) on delete cascade,

  -- Aus welchem Ordner: einnahme (Ausgangsrechnung) / ausgabe (Eingangsrechnung).
  kind text not null check (kind in ('einnahme', 'ausgabe')),
  -- Herkunft: onedrive | upload | manuell.
  source text not null default 'onedrive',
  onedrive_item_id text,

  file_name text not null,
  file_mime text,
  file_size bigint,

  -- Ausgelesene Felder (KI/OCR ab Phase 4) – anfangs null.
  haendler text,
  beleg_datum date,
  brutto_cents bigint,
  ust_cents bigint,
  netto_cents bigint,
  ust_satz numeric(5, 2),
  rechnungsnummer text,
  kategorie_id text,
  konfidenz numeric(5, 2),
  rohtext text,
  erkannt jsonb not null default '{}'::jsonb,

  status text not null default 'offen'
    check (status in ('offen', 'zugeordnet', 'ignoriert')),
  notiz text,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookkeeping_receipts_entity_idx
  on public.bookkeeping_receipts (billing_entity_id, kind, created_at desc);

-- Dedup: dieselbe OneDrive-Datei nur einmal je Firma.
create unique index if not exists bookkeeping_receipts_item_unique
  on public.bookkeeping_receipts (billing_entity_id, onedrive_item_id)
  where onedrive_item_id is not null;

create table if not exists public.bookkeeping_import_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_entity_id uuid not null references public.billing_entities(id) on delete cascade,
  kind text not null,                 -- 'einnahme' | 'ausgabe' | 'kontoauszug'
  source text,                        -- Ordnerpfad / Dateiname
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists bookkeeping_import_log_entity_idx
  on public.bookkeeping_import_log (billing_entity_id, created_at desc);

alter table public.bookkeeping_receipts   enable row level security;
alter table public.bookkeeping_import_log enable row level security;

create policy bookkeeping_receipts_select on public.bookkeeping_receipts
  for select using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );
create policy bookkeeping_receipts_write on public.bookkeeping_receipts
  for all using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  ) with check (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );

create policy bookkeeping_import_log_select on public.bookkeeping_import_log
  for select using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );
create policy bookkeeping_import_log_write on public.bookkeeping_import_log
  for all using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  ) with check (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );

create trigger bookkeeping_receipts_set_updated_at
  before update on public.bookkeeping_receipts
  for each row execute function public.set_updated_at();
