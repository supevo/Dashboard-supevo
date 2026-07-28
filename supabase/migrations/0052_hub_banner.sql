-- =============================================================================
-- Migration 0052 – Level-Hub-Titelbild
--
-- Freischaltbares Titelbild (Verlauf) hinter XP-Kreis und Profilbild im Level
-- Hub. Nur ein Schlüssel je Profil; die konkreten Verläufe + Freischalt-Level
-- liegen im Code (banners.ts), daher genügt eine Text-Spalte.
-- =============================================================================

alter table public.profiles
  add column if not exists hub_banner text;
