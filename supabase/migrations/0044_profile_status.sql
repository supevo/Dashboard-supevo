-- =============================================================================
-- Migration 0044 – User presence status (online / afk / dnd)
--
-- A self-set availability status shown next to the avatar and pickable from the
-- user menu. Not real presence tracking — just a manual status.
-- =============================================================================

alter table public.profiles
  add column if not exists status text not null default 'online'
    check (status in ('online', 'afk', 'dnd'));
