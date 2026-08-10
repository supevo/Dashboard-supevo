-- =============================================================================
-- Migration 0120 – Belege: sauberer Auslese-Status
--
-- Bisher wurde "schon versucht" heuristisch über andere Felder abgeleitet, was
-- fragil war (Belege blieben hängen oder wurden nie als offen erkannt). Jetzt
-- eindeutig:
--   * brutto_cents IS NULL          → noch nicht erfolgreich ausgelesen
--   * extract_failed_at IS NOT NULL → beim Auslesen fehlgeschlagen (übersprungen)
-- Offen = brutto_cents null UND extract_failed_at null UND onedrive_item_id da.
-- =============================================================================

alter table public.bookkeeping_receipts
  add column if not exists extract_failed_at timestamptz;

-- Findet offene Belege schnell (für den KI-Auslese-Durchlauf).
create index if not exists bookkeeping_receipts_extract_open_idx
  on public.bookkeeping_receipts (billing_entity_id)
  where brutto_cents is null and extract_failed_at is null;
