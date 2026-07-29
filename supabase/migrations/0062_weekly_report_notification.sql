-- =============================================================================
-- Migration 0062 – Benachrichtigungstyp für Wochenbericht-Erinnerung
--
-- Wöchentlicher Cron erinnert Mitarbeiter an fällige Kunden-Wochenberichte.
-- =============================================================================

alter type public.notification_type add value if not exists 'weekly_report_due';
