-- =============================================================================
-- Migration 0167 – Telefonnummer im Profil
--
-- Mitarbeitende können eine Telefonnummer im eigenen Profil hinterlegen; sie
-- wird dem Kunden bei „Ihr Ansprechpartner" angezeigt (neben der E-Mail).
-- =============================================================================

alter table public.profiles
  add column if not exists phone text;

notify pgrst, 'reload schema';
