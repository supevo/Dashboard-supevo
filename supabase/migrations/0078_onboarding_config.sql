-- =============================================================================
-- Migration 0078 – Onboarding wird von der Agentur gesteuert (Klick-Funnel)
--
-- Bisher sah jeder Kunde automatisch den Onboarding-Stepper. Jetzt entscheidet
-- die Agentur beim Anlegen/Bearbeiten eines Kunden, ob überhaupt ein Onboarding
-- startet und welche Bestandteile gelten (Vertrag / SEPA / Marketingplan). Der
-- Kunde sieht im Portal nur die aktivierten Schritte.
--
-- Zusätzlich kann die Agentur ein Vertrags-PDF hinterlegen, das der Kunde vor
-- der Unterschrift lesen/scrollen kann (contract_template_path).
-- =============================================================================

alter table public.client_onboarding
  add column if not exists started boolean not null default false,
  add column if not exists requires_contract boolean not null default true,
  add column if not exists requires_sepa boolean not null default true,
  add column if not exists requires_plan boolean not null default true,
  add column if not exists contract_template_path text,
  add column if not exists contract_template_name text;

-- Bestehende (bereits genutzte) Onboardings gelten als gestartet, damit sie
-- nicht plötzlich verschwinden.
update public.client_onboarding
  set started = true
  where contract_signed_at is not null
     or sepa_signed_at is not null;
