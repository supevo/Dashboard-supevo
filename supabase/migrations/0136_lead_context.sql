-- =============================================================================
-- 0136 – Kontextfelder am Lead (Grundlage für KI-Aufgaben & Angebot)
-- Branche, Ziele/Vorhaben, Zielgruppe und Website/Ist-Zustand. Fließen in die
-- KI-Aufgabenerstellung bei der Umwandlung Lead → Projekt ein.
-- =============================================================================
alter table public.leads
  add column if not exists industry text,
  add column if not exists goals text,
  add column if not exists target_group text,
  add column if not exists website text;
