-- Kunden-Sichtbarkeit für die Kundenanfragen (Kanban-Leadboard) je Kunde.
-- Steuert, ob der Kunde das Board im Portal sieht (unabhängig davon, ob der
-- E-Mail-/Webhook-Eingang aktiv ist).
set lock_timeout = '5s';

alter table public.inquiry_endpoints
  add column if not exists client_visible boolean not null default false;
