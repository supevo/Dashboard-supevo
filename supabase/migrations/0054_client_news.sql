-- =============================================================================
-- Migration 0054 – Branchen-News-Ticker fürs Kundenportal
--
-- Cache der aktuellen Branchen-News je Kundenunternehmen. Wird beim Portal-
-- Aufruf lazy einmal pro Tag aktualisiert (nur wenn der Kunde online ist).
-- Lesen/Schreiben erfolgt ausschließlich über den Service-Client im Server-
-- Code (nach der Portal-Zugriffsprüfung), daher genügt aktivierte RLS ohne
-- zusätzliche Policy (Default deny).
-- =============================================================================

create table if not exists public.client_news (
  client_company_id uuid primary key references public.client_companies(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

alter table public.client_news enable row level security;
