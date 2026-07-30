-- =============================================================================
-- Migration 0076 – Datei-Upload im Team-Chat (mit 60-Tage-Auto-Löschung)
--
-- Nachrichten können eine Datei tragen (Vorschau im Chat). Dateien werden nach
-- 60 Tagen automatisch gelöscht (Speicher sparen) – es sei denn, sie sind als
-- „wichtig" markiert (file_keep = true → dauerhaft). Der Cleanup-Cron entfernt
-- die Storage-Datei und setzt file_removed = true.
-- =============================================================================

alter table public.chat_channel_messages
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_mime text,
  add column if not exists file_size bigint,
  add column if not exists file_keep boolean not null default false,
  add column if not exists file_removed boolean not null default false,
  add column if not exists file_expires_at timestamptz;

-- Für den Cleanup: schnell die fälligen, nicht-wichtigen, noch vorhandenen Dateien finden.
create index if not exists chat_msg_file_expiry_idx
  on public.chat_channel_messages (file_expires_at)
  where file_path is not null and file_keep = false and file_removed = false;
