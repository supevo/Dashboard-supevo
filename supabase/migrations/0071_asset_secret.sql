-- =============================================================================
-- Migration 0071 – Verschlüsseltes Login-Passwort im Marken-Hub
--
-- Zugänge (category = 'access') können ein Passwort tragen. Es wird NUR
-- verschlüsselt (AES-256-GCM, Schlüssel als Env-Variable SECRET_ENCRYPTION_KEY)
-- gespeichert – der Klartext liegt nie in der DB. Entschlüsselt wird
-- serverseitig, nur für das Agentur-Team.
--
-- client_visible: Zugänge, die der Kunde selbst im Portal anlegt, sind für den
-- Kunden sichtbar (Dienst/Benutzer, ohne Klartext-Passwort). Vom Team angelegte
-- Zugänge bleiben team-intern (Default false).
-- =============================================================================

alter table public.client_assets
  add column if not exists secret_encrypted text;

alter table public.client_assets
  add column if not exists client_visible boolean not null default false;
