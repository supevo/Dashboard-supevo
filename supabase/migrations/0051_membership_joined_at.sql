-- =============================================================================
-- Migration 0051 – Eintrittsdatum pro Mitgliedschaft
--
-- „Im Unternehmen seit" ist bisher aus memberships.created_at abgeleitet (wann
-- die Mitgliedschaft im System angelegt wurde). Das entspricht oft nicht dem
-- echten Eintrittsdatum. Admins/Superadmins können es jetzt explizit setzen;
-- der Level Hub nutzt es, falls gesetzt, sonst weiterhin created_at.
-- =============================================================================

alter table public.memberships
  add column if not exists joined_company_at date;
