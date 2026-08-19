-- Trennt KI- und händische Aufwandsschätzung.
--   ai_estimate_minutes     – Rohwert der KI (Referenz + Lern-Beispiele)
--   manual_estimate_minutes – händischer Wert; überschreibt die KI
--   estimated_minutes       – bleibt der EFFEKTIVE Wert (manuell ∨ KI), den
--                             XP/Health/Awards/Workload weiterverwenden.
alter table public.tasks
  add column if not exists ai_estimate_minutes integer,
  add column if not exists manual_estimate_minutes integer;

-- Bestehende Schätzungen waren KI-generiert → als KI-Rohwert übernehmen.
update public.tasks
  set ai_estimate_minutes = estimated_minutes
  where ai_estimate_minutes is null
    and estimated_minutes is not null;

-- Index für die Lern-Beispiele (letzte händische Schätzungen je Org).
create index if not exists tasks_manual_estimate_idx
  on public.tasks (organization_id, updated_at desc)
  where manual_estimate_minutes is not null;
