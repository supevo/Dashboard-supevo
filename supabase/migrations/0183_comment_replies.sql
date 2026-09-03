-- =============================================================================
-- Migration 0183 – Antworten auf Kommentare (eine Ebene)
--
-- Kommentare können jetzt auf einen anderen Kommentar antworten. Bewusst nur
-- EINE Verschachtelungsebene: Antworten hängen an einem Top-Level-Kommentar,
-- eine Antwort auf eine Antwort gibt es nicht (hält die schmale Aufgaben-/
-- Portal-Spalte lesbar).
-- =============================================================================

alter table public.comments
  add column if not exists parent_comment_id uuid
    references public.comments(id) on delete cascade;

create index if not exists comments_parent_idx
  on public.comments (parent_comment_id)
  where parent_comment_id is not null;

-- Benachrichtigung, wenn jemand auf den eigenen Kommentar antwortet.
alter type public.notification_type add value if not exists 'comment_reply';

notify pgrst, 'reload schema';
