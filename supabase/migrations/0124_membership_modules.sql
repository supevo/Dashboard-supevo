-- =============================================================================
-- 0124 – Mitgliedschafts-Baukasten (Module + geplante Änderungen)
-- Der Konfigurator speichert die aktive Modulauswahl als JSON; custom_net_cents
-- bleibt die Summe (Abrechnung unverändert). Änderungen greifen erst zum
-- Folgemonat: pending_modules + pending_effective_date halten die geplante
-- Auswahl, bis der Stichtag erreicht ist. client_can_edit gibt den Baukasten
-- für den Kunden im Portal frei (Phase 2).
-- =============================================================================
alter table public.client_memberships
  add column if not exists modules jsonb not null default '[]'::jsonb;
alter table public.client_memberships
  add column if not exists pending_modules jsonb;
alter table public.client_memberships
  add column if not exists pending_effective_date date;
alter table public.client_memberships
  add column if not exists client_can_edit boolean not null default false;
