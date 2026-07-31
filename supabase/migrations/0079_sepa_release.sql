-- =============================================================================
-- Migration 0079 – SEPA-Mandat: Vorschau + Freigabe durch die Agentur
--
-- Die Agentur generiert eine SEPA-Mandat-Vorschau (PDF mit Gläubigerdaten +
-- Mandatsreferenz), prüft sie und gibt sie frei. Erst nach der Freigabe sieht
-- der Kunde den SEPA-Schritt im Portal und ergänzt IBAN + Unterschrift.
-- =============================================================================

alter table public.client_onboarding
  add column if not exists sepa_preview_path text,
  add column if not exists sepa_released boolean not null default false,
  add column if not exists sepa_released_at timestamptz;

-- Bereits unterschriebene SEPA-Mandate gelten als freigegeben (Bestandsdaten).
update public.client_onboarding
  set sepa_released = true
  where sepa_signed_at is not null;

-- Benachrichtigungstyp für Onboarding-Freigaben (z. B. SEPA an Kunden gesendet).
alter type public.notification_type add value if not exists 'onboarding';
