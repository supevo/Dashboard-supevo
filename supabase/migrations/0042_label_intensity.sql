-- =============================================================================
-- Migration 0042 – Label intensity (visual emphasis)
--
-- Labels get an intensity level so important ones stand out: 1 = normal,
-- 2 = strong (pulsing highlight in the UI, also for clients in the portal).
-- =============================================================================

alter table public.labels
  add column if not exists intensity smallint not null default 1
    check (intensity in (1, 2));
