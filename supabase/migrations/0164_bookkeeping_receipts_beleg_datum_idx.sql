-- =============================================================================
-- Migration 0164 – Index für die Beleg-Liste (Sortierung nach Belegdatum)
--
-- Die Beleg-Liste (receipt-queries.ts) filtert nach billing_entity_id (+ optional
-- kind) und einem beleg_datum-Bereich und sortiert nach `beleg_datum desc`. Der
-- vorhandene Index bookkeeping_receipts_entity_idx deckt (billing_entity_id,
-- kind, created_at) ab – NICHT die Sortierung/Filterung nach beleg_datum. Dadurch
-- musste Postgres pro Firma alle Belege lesen und im Speicher nach beleg_datum
-- sortieren (im Slow-Query-Report mit 190–820 ms mittlerer Laufzeit sichtbar).
--
-- Ein passender Index bedient WHERE billing_entity_id + beleg_datum-Bereich und
-- die ORDER BY beleg_datum desc direkt. `nulls last` spiegelt die Abfrage
-- (`ascending:false, nullsFirst:false`) wider, damit auch Belege ohne Datum
-- effizient am Ende einsortiert werden.
-- =============================================================================

create index if not exists bookkeeping_receipts_entity_beleg_datum_idx
  on public.bookkeeping_receipts (billing_entity_id, beleg_datum desc nulls last);

-- PostgREST-Schema-Cache neu laden (unkritisch, aber konsistent zu anderen
-- Migrationen).
notify pgrst, 'reload schema';
