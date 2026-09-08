-- =============================================================================
-- Migration 0189 – Projekte & Aufgaben standardmäßig für Kunden sichtbar
--
-- Bisher wurden Projekte mit is_client_visible=false angelegt (Board im Portal
-- erst nach manuellem Freischalten sichtbar) und Aufgaben mit is_internal=true
-- (nur die Haupt-Anlage-Wege setzten explizit is_internal=false). Das führte
-- dazu, dass Kunden das Board nicht sahen, obwohl einzelne Aufgaben als sichtbar
-- markiert waren. Ab jetzt sind beide standardmäßig für Kunden sichtbar;
-- Ausnahmen lassen sich weiterhin pro Projekt bzw. pro Aufgabe setzen.
-- =============================================================================

-- Neue Standardwerte für künftige Einträge.
alter table public.projects alter column is_client_visible set default true;
alter table public.tasks alter column is_internal set default false;

-- Bestehende, nicht gelöschte Projekte für ihre Kunden freischalten, damit die
-- Boards sofort im Portal erscheinen. Einzelne Projekte können in den
-- Projekt-Einstellungen wieder ausgeblendet werden.
update public.projects
  set is_client_visible = true
  where is_client_visible = false and deleted_at is null;

notify pgrst, 'reload schema';
