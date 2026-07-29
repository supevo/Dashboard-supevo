-- =============================================================================
-- Migration 0059 – Öffnungs-Videos für Lootboxen
--
-- Optionales Video je Box-Stufe (common/rare/super), das beim Öffnen abgespielt
-- wird, bevor das gewonnene Item erscheint. Liegt im Files-Bucket, Zugriff über
-- den Service-Client nach App-Prüfung.
-- =============================================================================

alter table public.loot_config add column if not exists video_common text;
alter table public.loot_config add column if not exists video_rare text;
alter table public.loot_config add column if not exists video_super text;
