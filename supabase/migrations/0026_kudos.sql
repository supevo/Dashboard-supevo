-- =============================================================================
-- Migration 0026 – Kudos & points (gamification core)
--
-- Colleagues and the boss give each other kudos with a badge + points. Points
-- accumulate per user and drive levels/leaderboard. Visible to agency staff of
-- the organization; never to clients.
-- =============================================================================

-- Notification type for kudos events.
alter type public.notification_type add value if not exists 'kudos';

create table if not exists public.kudos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  badge text not null,
  message text,
  points integer not null default 10 check (points between 0 and 100),
  created_at timestamptz not null default now(),
  constraint kudos_not_self check (from_user_id <> to_user_id)
);
create index if not exists kudos_org_created_idx
  on public.kudos (organization_id, created_at desc);
create index if not exists kudos_to_user_idx on public.kudos (to_user_id);

alter table public.kudos enable row level security;

create policy kudos_select on public.kudos
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create policy kudos_insert on public.kudos
  for insert with check (
    from_user_id = auth.uid()
    and public.is_agency_staff()
    and organization_id in (select public.current_user_org_ids())
  );

-- The giver can remove their own kudos; org admins can remove any.
create policy kudos_delete on public.kudos
  for delete using (
    from_user_id = auth.uid() or public.is_org_admin(organization_id)
  );
