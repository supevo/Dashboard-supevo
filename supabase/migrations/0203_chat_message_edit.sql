-- =============================================================================
-- Migration 0203 – Gesendete Chat-Nachrichten kurz nach dem Senden bearbeiten
--
-- Nutzer sollen eigene Textnachrichten eine begrenzte Zeit lang (siehe
-- EDIT_WINDOW im Server-Code) nachträglich korrigieren können. Wir merken uns
-- nur, WANN zuletzt bearbeitet wurde – für den „(bearbeitet)"-Hinweis. null =
-- nie bearbeitet.
-- =============================================================================

alter table public.chat_channel_messages
  add column if not exists edited_at timestamptz;
