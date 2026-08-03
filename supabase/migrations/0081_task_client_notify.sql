-- =============================================================================
-- Migration 0081 – Kunde bei erledigter Aufgabe informieren
--
-- Mitarbeiter können bei einer erledigten Aufgabe eine kurze Nachricht an den
-- Kunden senden ("… wir haben … erledigt"). Wir merken uns, wann zuletzt
-- informiert wurde (für das Badge am Kanban und die Statusanzeige).
-- =============================================================================

alter table public.tasks
  add column if not exists client_notified_at timestamptz;

-- Benachrichtigungstyp für die Kunden-Info bei erledigten Aufgaben.
alter type public.notification_type add value if not exists 'task_done';
