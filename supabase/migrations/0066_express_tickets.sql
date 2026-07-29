-- =============================================================================
-- Migration 0066 – Express-Tickets (Prio-Pass)
--
-- Je nach Mitgliedschaft bekommt ein Kunde X Express-Tickets pro Monat
-- (express_tickets_per_month, vom Admin gesetzt). Löst er eines auf einer
-- Aufgabe ein, wird die Aufgabe als "Express" markiert (tasks.is_express) und
-- pulsiert auf dem Board. Verbrauchte Tickets werden pro Monat gezählt.
-- =============================================================================

alter table public.client_companies
  add column if not exists express_tickets_per_month integer not null default 0
    check (express_tickets_per_month >= 0 and express_tickets_per_month <= 10);

alter table public.tasks
  add column if not exists is_express boolean not null default false;

create table if not exists public.express_ticket_redemptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  redeemed_by uuid references public.profiles(id) on delete set null,
  period text not null, -- 'YYYY-MM' (Europe/Berlin)
  created_at timestamptz not null default now()
);

create index if not exists express_redemptions_period_idx
  on public.express_ticket_redemptions (client_company_id, period);

alter table public.express_ticket_redemptions enable row level security;
