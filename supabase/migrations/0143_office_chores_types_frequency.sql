-- =============================================================================
-- Migration 0143 – Ordnungsdienst: Typen (persönlich/geteilt), Häufigkeit,
-- Periodenschlüssel (einmal je Zeitraum) und Status 'missed' (nachzuholen).
-- =============================================================================

-- kind: 'personal' (jeder hat seine eigene Instanz, z. B. eigener Arbeitsplatz)
--       'shared'   (einer erledigt, ein anderer prüft gegen)
-- frequency: 'daily' | 'weekly' | 'monthly' (muss einmal im Zeitraum erledigt sein)
alter table public.office_chores
  add column if not exists kind text not null default 'shared',
  add column if not exists frequency text not null default 'daily';

-- Nicht erledigt bis Periodenende → 'missed' (beim Einstempeln gemeldet,
-- nachzuholen ohne XP).
alter type public.office_chore_status add value if not exists 'missed';

-- Periodenschlüssel je Zuweisung: verhindert Doppelzuteilung im selben Zeitraum
-- und markiert, zu welcher Periode die Zuweisung gehört.
alter table public.office_chore_assignments
  add column if not exists period_key text;

create index if not exists office_chore_assignments_chore_period_idx
  on public.office_chore_assignments (chore_id, period_key);
create index if not exists office_chore_assignments_assignee_period_idx
  on public.office_chore_assignments (assignee_id, chore_id, period_key);
