-- =============================================================================
-- Migration 0106 – Arbeitszeit: automatisch geschlossene Sitzungen markieren
--
-- Wenn jemand vergisst auszustempeln, schließt das System die Sitzung nach 11 h
-- Nettoarbeitszeit automatisch und rechnet nur 8 h an. Solche Sitzungen werden
-- hier als `auto_closed = true` markiert, damit sie klar von einem korrekten
-- (selbst durchgeführten) Ausstempeln unterscheidbar sind: nur letzteres gibt
-- Arbeitszeit-XP und zählt für den Arbeitszeit-Streak.
-- =============================================================================

alter table public.work_sessions
  add column if not exists auto_closed boolean not null default false;
