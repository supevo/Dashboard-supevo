-- =============================================================================
-- Migration 0039 – Kudos for completed tasks
--
-- When a task is moved into a done column it records who completed it. Other
-- team members then award kudos points for that finished task (peer review).
-- Kudos rows gain an optional task_id so task-based kudos reuse the existing
-- points/leaderboard, with one rating per rater per task.
-- =============================================================================

alter table public.tasks
  add column if not exists completed_by uuid references public.profiles(id) on delete set null,
  add column if not exists completed_at timestamptz;

alter table public.kudos
  add column if not exists task_id uuid references public.tasks(id) on delete cascade;

create unique index if not exists kudos_task_rater_idx
  on public.kudos (task_id, from_user_id)
  where task_id is not null;
