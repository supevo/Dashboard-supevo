-- =============================================================================
-- Migration 0063 – Präsenz: "zuletzt gesehen"-Zeitstempel
--
-- Ohne Zeitstempel blieb profiles.status auf 'online' hängen, wenn jemand den
-- Tab schloss. Der Client-Heartbeat aktualisiert nun last_seen_at; beim Lesen
-- gilt Präsenz als offline, wenn der letzte Heartbeat zu lange her ist.
-- =============================================================================

alter table public.profiles
  add column if not exists last_seen_at timestamptz;
