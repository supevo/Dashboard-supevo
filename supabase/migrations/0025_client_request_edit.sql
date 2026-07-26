-- =============================================================================
-- Migration 0025 – Let clients edit their own briefing while it is still new
--
-- Adds an UPDATE policy so the person who submitted a client_request may edit it
-- as long as it has not been processed/dismissed (status = 'new'). Agency staff
-- keep their existing broader update policy.
-- =============================================================================

create policy client_requests_update_own on public.client_requests
  for update using (submitted_by = auth.uid() and status = 'new')
  with check (submitted_by = auth.uid() and status = 'new');
