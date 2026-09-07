-- =============================================================================
-- Migration 0185 – Benachrichtigungstyp für den GF-Coach
--
-- Der GF-Coach stupst den/die Geschäftsführer:in morgens (Tagesplan) und abends
-- (Check-in) proaktiv an – über In-App-Benachrichtigung, E-Mail und Web-Push.
-- =============================================================================

alter type public.notification_type add value if not exists 'gf_coach';

notify pgrst, 'reload schema';
