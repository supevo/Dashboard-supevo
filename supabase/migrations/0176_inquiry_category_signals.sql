-- =============================================================================
-- Migration 0176 – Kundenanfragen: KI-Kategorie + Signale
--
-- category      = von der KI zugeordnete Gewerk-Kategorie (Badge), z. B.
--                 'bad','heizung','klima','waermepumpe','solar','elektro','sonstiges'.
-- ai_urgency    = aus der Anfrage geschätzte Dringlichkeit (1–10, „zeitnah?").
-- ai_potential  = aus der Anfrage geschätztes Auftragspotenzial (1–10).
-- Alle optional (NULL, solange die KI nichts erkannt hat / KI aus ist).
-- =============================================================================

alter table public.web_inquiries
  add column if not exists category text;
alter table public.web_inquiries
  add column if not exists ai_urgency smallint
    check (ai_urgency is null or (ai_urgency between 1 and 10));
alter table public.web_inquiries
  add column if not exists ai_potential smallint
    check (ai_potential is null or (ai_potential between 1 and 10));
