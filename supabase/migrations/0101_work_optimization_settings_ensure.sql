-- =============================================================================
-- Migration 0101 – Sicherstellen: Tabelle für KI-Arbeitsoptimierung
--
-- Idempotente Absicherung von Migration 0082. Falls die Tabelle in einer
-- Umgebung nie angelegt wurde (z. B. weil 0082 an der enum-Zeile abgebrochen
-- ist), schlug das Speichern der Einstellungen mit „Speichern fehlgeschlagen"
-- fehl. Diese Migration legt Tabelle, Spalten und Policy bei Bedarf an; ist
-- alles bereits vorhanden, sind alle Anweisungen No-Ops.
-- =============================================================================

create table if not exists public.work_optimization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  cadence text not null default 'off',
  auto_apply boolean not null default false,
  reassign boolean not null default true,
  last_run_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.work_optimization_settings
  add column if not exists cadence text not null default 'off';
alter table public.work_optimization_settings
  add column if not exists auto_apply boolean not null default false;
alter table public.work_optimization_settings
  add column if not exists reassign boolean not null default true;
alter table public.work_optimization_settings
  add column if not exists last_run_at timestamptz;
alter table public.work_optimization_settings
  add column if not exists updated_at timestamptz not null default now();

alter table public.work_optimization_settings enable row level security;

drop policy if exists work_optimization_admin_all on public.work_optimization_settings;
create policy work_optimization_admin_all on public.work_optimization_settings
  for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
