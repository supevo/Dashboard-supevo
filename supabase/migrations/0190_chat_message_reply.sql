-- =============================================================================
-- Migration 0190 – Antworten auf Chat-Nachrichten (Zitat wie bei WhatsApp)
--
-- Eine Nachricht kann sich auf eine andere Nachricht desselben Kanals beziehen.
-- reply_to_id verweist auf die zitierte Nachricht; wird diese gelöscht, bleibt
-- die Antwort erhalten (Verweis wird auf NULL gesetzt).
-- =============================================================================

alter table public.chat_channel_messages
  add column if not exists reply_to_id uuid
    references public.chat_channel_messages(id) on delete set null;

create index if not exists chat_channel_messages_reply_to_idx
  on public.chat_channel_messages (reply_to_id)
  where reply_to_id is not null;

notify pgrst, 'reload schema';
