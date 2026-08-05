-- =============================================================================
-- Migration 0099 – Benachrichtigungstyp „print_billing"
--
-- Für die Benachrichtigung an den Erlediger, wenn eine fertige Aufgabe eine
-- Drucksachen-Abrechnung erfordert (Rechnung des Dienstleisters hochladen).
--
-- HINWEIS: Diese Zeile (alter type ... add value) muss SEPARAT / außerhalb einer
-- Transaktion mit anderen Statements laufen.
-- =============================================================================

alter type public.notification_type add value if not exists 'print_billing';
