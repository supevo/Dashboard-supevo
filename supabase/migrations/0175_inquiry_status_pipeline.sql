-- =============================================================================
-- Migration 0175 – Kundenanfragen: Vertriebs-Status-Pipeline
--
-- Der Lead-Bereich der Kunden (web_inquiries) bekommt eine echte Vertriebs-
-- Pipeline. Bisher: 'new','called','mailed','done'. Neu kommen dazu:
--   not_reached (Nicht erreicht) · reached (Erreicht) · appointment (Termin)
--   offer (Angebot) · won (Auftrag) · lost (Abgesagt)
-- Die alten Werte bleiben für Bestandsdaten erhalten und werden in der UI auf
-- die neuen Spalten abgebildet (called/mailed → Erreicht, done → Auftrag).
--
-- HINWEIS: „alter type ... add value" läuft je Statement außerhalb einer
-- Transaktion mit anderen Statements.
-- =============================================================================

alter type public.inquiry_status add value if not exists 'not_reached';
alter type public.inquiry_status add value if not exists 'reached';
alter type public.inquiry_status add value if not exists 'appointment';
alter type public.inquiry_status add value if not exists 'offer';
alter type public.inquiry_status add value if not exists 'won';
alter type public.inquiry_status add value if not exists 'lost';
