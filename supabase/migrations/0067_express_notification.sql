-- =============================================================================
-- Migration 0067 – Notification type "express_redeemed"
--
-- Wird ausgelöst, wenn ein Kunde ein Express-Ticket auf einer Aufgabe einlöst,
-- damit das Team sofort sieht, dass die Aufgabe in der Warteschlange vorspringt.
-- =============================================================================

alter type public.notification_type add value if not exists 'express_redeemed';
