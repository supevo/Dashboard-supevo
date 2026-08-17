-- =============================================================================
-- 0135 – Eingelöste Gutscheine am Lead-Angebot speichern
-- Liste der eingelösten Promotion-IDs (jsonb-Array), damit die Auswahl beim
-- erneuten Öffnen des Angebots erhalten bleibt.
-- =============================================================================
alter table public.leads
  add column if not exists redeemed_promotions jsonb not null default '[]'::jsonb;
