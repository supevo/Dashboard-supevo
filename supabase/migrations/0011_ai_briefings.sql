-- =============================================================================
-- Migration 0011 – AI morning briefings
--
-- Caches the personalized morning briefing that Claude generates for each
-- employee, one row per user per calendar day (Europe/Berlin). Generation runs
-- server-side via the service client; users may read their own briefing only.
-- =============================================================================

create table if not exists public.ai_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  briefing_date date not null,
  summary text not null,
  priorities jsonb not null default '[]'::jsonb,
  next_move text,
  notes jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now(),
  unique (user_id, briefing_date)
);

create index if not exists ai_briefings_user_date_idx
  on public.ai_briefings (user_id, briefing_date desc);

alter table public.ai_briefings enable row level security;

-- Users may read their own briefings. Writes happen through the service client
-- (which bypasses RLS), so no insert/update policy is granted here.
create policy ai_briefings_select on public.ai_briefings
  for select using (user_id = auth.uid() or public.is_super_admin());
