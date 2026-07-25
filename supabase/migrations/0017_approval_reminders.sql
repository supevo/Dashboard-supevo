-- =============================================================================
-- Migration 0017 – Approval reminders
--
-- Tracks when a pending approval was last nudged, so a daily cron can send a
-- follow-up email to the client without spamming every day.
-- =============================================================================

alter table public.approvals
  add column if not exists last_reminder_at timestamptz;

-- Helps the cron scan for stale pending approvals efficiently.
create index if not exists approvals_pending_reminder_idx
  on public.approvals (status, created_at)
  where status = 'pending';
