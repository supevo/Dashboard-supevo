-- =============================================================================
-- Migration 0114 – Buchhaltung: Firmenprofile (accounting_profiles)
--
-- Das neue Finanz-/Buchhaltungsmodul koppelt sich an die bestehenden
-- Rechnungssteller (billing_entities). Jede „Firma" der Buchhaltung IST eine
-- billing_entity (z. B. „supevo GmbH" und „ONE STEP"). Damit sind die Bücher
-- der beiden Firmen strikt getrennt: alle künftigen Buchhaltungstabellen tragen
-- billing_entity_id als Trennschlüssel, und dieses Profil hält die steuerlichen
-- Stammdaten + die Verknüpfung zu den OneDrive-Ordnern (Einnahmen/Ausgaben).
--
-- 1:1 zu billing_entities (billing_entity_id ist Primärschlüssel). Name, Adresse,
-- USt-IdNr., Bankdaten kommen weiterhin aus billing_entities; hier liegen nur die
-- buchhalterischen Zusatzfelder.
-- =============================================================================

create table if not exists public.accounting_profiles (
  billing_entity_id uuid primary key
    references public.billing_entities(id) on delete cascade,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  -- Rechtsform steuert Gewinnermittlung (EÜR vs. Bilanz) und Steuerart.
  rechtsform text not null default 'einzelunternehmen'
    check (rechtsform in (
      'einzelunternehmen', 'freiberufler', 'gbr',
      'ug', 'gmbh',
      'gmbh_co_kg', 'ohg', 'kg'
    )),
  inhaber text,

  -- Umsatzsteuer / Kleinunternehmer §19 UStG.
  kleinunternehmer boolean not null default false,
  ust_periode text not null default 'quartal'
    check (ust_periode in ('monat', 'quartal')),

  -- Gewerbesteuer-Hebesatz der Gemeinde in Prozent (z. B. 400.00).
  hebesatz numeric(6, 2),

  -- Einkommensteuer-Kontext (nur für Einzel/Personengesellschaften relevant).
  kirchensteuer boolean not null default false,
  splitting boolean not null default false,            -- Ehegatten-Splitting
  weitere_einkuenfte_cents bigint not null default 0,  -- zvE-Zuschlag p.a.

  -- Belegregeln: kategorie_id -> "kein Beleg nötig" (Dauerbeleg-Ausnahmen).
  belegregeln jsonb not null default '{}'::jsonb,

  -- Verknüpfte OneDrive-Ordner (Quelle der Wahrheit für Belegdateien).
  onedrive_einnahmen_folder_id text,
  onedrive_einnahmen_folder_path text,
  onedrive_ausgaben_folder_id text,
  onedrive_ausgaben_folder_path text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounting_profiles_org_idx
  on public.accounting_profiles (organization_id);

alter table public.accounting_profiles enable row level security;

-- Buchhaltung ist intern: Org-Admins/Super-Admin (wie billing_entities).
create policy accounting_profiles_select on public.accounting_profiles
  for select using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );
create policy accounting_profiles_write on public.accounting_profiles
  for all using (
    public.is_org_admin(organization_id) or public.is_super_admin()
  ) with check (
    public.is_org_admin(organization_id) or public.is_super_admin()
  );

create trigger accounting_profiles_set_updated_at
  before update on public.accounting_profiles
  for each row execute function public.set_updated_at();
