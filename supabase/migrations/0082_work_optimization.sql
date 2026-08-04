-- =============================================================================
-- Migration 0082 – KI-Arbeitsoptimierung (Zeitplan + Automatikmodus)
--
-- Einstellungen pro Organisation, wie oft die KI die Arbeitsverteilung
-- optimiert (unbesetzte Aufgaben zuweisen + überlastete/abwesende entlasten)
-- und ob das automatisch (ohne Bestätigung) laufen soll.
-- =============================================================================

create table if not exists public.work_optimization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  cadence text not null default 'off',      -- off | daily | every_2_days | weekly
  auto_apply boolean not null default false, -- Automatikmodus: Änderungen direkt anwenden
  reassign boolean not null default true,    -- auch umverteilen/entlasten (nicht nur zuweisen)
  last_run_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.work_optimization_settings enable row level security;

create policy work_optimization_admin_all on public.work_optimization_settings
  for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- Benachrichtigungstyp für die automatische Optimierung an Admins.
alter type public.notification_type add value if not exists 'optimization';
