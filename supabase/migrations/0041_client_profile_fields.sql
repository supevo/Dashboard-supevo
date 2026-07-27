-- =============================================================================
-- Migration 0041 – Client profile fields (industry, brands, interests)
--
-- Extra descriptive fields on a client company for future use (targeting,
-- reports, AI context). Free text, agency-managed.
-- =============================================================================

alter table public.client_companies
  add column if not exists industry text,
  add column if not exists brands text,
  add column if not exists interests text;
