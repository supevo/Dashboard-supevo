-- =============================================================================
-- Migration 0201 – Chat-Nachrichten in den Realtime-Stream aufnehmen
--
-- Bisher lief die gesamte Zustellung über Polling: jede offene Unterhaltung
-- pollte die Nachrichten und der Ungelesen-Zähler lief alle 30 s (die teuerste
-- Last). Mit dieser Migration liefert Supabase Realtime INSERTs auf
-- chat_channel_messages direkt aus (postgres_changes). Das Dashboard aktualisiert
-- den Ungelesen-Zähler dann sofort bei einer neuen Nachricht statt im 30-s-Takt;
-- das Polling bleibt nur noch als seltenes Sicherheitsnetz.
--
-- Realtime respektiert die RLS: ein Client erhält nur INSERTs für Kanäle, die er
-- ohnehin lesen darf (can_access_chat_channel).
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_channel_messages'
  ) then
    alter publication supabase_realtime add table public.chat_channel_messages;
  end if;
end $$;
