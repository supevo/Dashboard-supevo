-- =============================================================================
-- Migration 0171 – Benachrichtigungstyp „late" (Verspätung beim Einstempeln)
--
-- Wer sich nach 08:45 (Europe/Berlin) einstempelt, erhält einen XP-Abzug im
-- XP-Ledger (public.xp_events, kind='late', negative Punkte, ref_id = die
-- work_session des ersten Stempels → idempotent pro Tag) und eine
-- Benachrichtigung dieses Typs. Der XP-Ledger unterstützt negative Punkte und
-- ref_id-Idempotenz bereits (Migrationen 0047/0113); daher ist hier nur der
-- neue Notification-Typ nötig.
--
-- HINWEIS: „alter type ... add value" muss SEPARAT / außerhalb einer
-- Transaktion mit anderen Statements laufen.
-- =============================================================================

alter type public.notification_type add value if not exists 'late';
