-- =============================================================================
-- Migration 0110 – Client attention factor (Betreuungs-Faktor)
--
-- Weight for the "fair-share" health traffic light: how large a share of the
-- team's attention this client should get. Default 1 = equal share. Higher for
-- clients who legitimately warrant more work (bigger retainer/package).
-- =============================================================================

alter table public.client_companies
  add column if not exists attention_factor double precision not null default 1;
