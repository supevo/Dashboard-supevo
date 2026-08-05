-- =============================================================================
-- Migration 0096 – Benachrichtigungs-Einstellung des Kunden (je Aufgabe)
--
-- Jeder Kunden-Kontakt kann selbst entscheiden, ob er aufgabenbezogene
-- Benachrichtigungen (z. B. „Aufgabe erledigt") erhalten möchte. Standard: an.
-- =============================================================================

alter table public.client_contacts
  add column if not exists notify_task_updates boolean not null default true;
