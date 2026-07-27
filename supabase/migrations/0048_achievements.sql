-- =============================================================================
-- Migration 0048 – Meilenstein-Auszeichnungen (Achievements)
--
-- Automatisch vergebene Abzeichen (erste Mission, 10/50/100 Missionen, Level 5,
-- erstes vergebenes Lob, 30 Tage/1 Jahr dabei …). Werden beim Erledigen einer
-- Aufgabe geprüft und einmalig gutgeschrieben. So ist die Auszeichnungen-Box
-- ab Tag 1 nicht leer.
-- =============================================================================

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  earned_at timestamptz not null default now(),
  unique (user_id, key)
);
create index if not exists achievements_user_idx on public.achievements (user_id);

alter table public.achievements enable row level security;

create policy achievements_select on public.achievements
  for select using (
    user_id = auth.uid()
    or (
      public.is_agency_staff()
      and organization_id in (select public.current_user_org_ids())
    )
    or public.is_super_admin()
  );
create policy achievements_insert on public.achievements
  for insert with check (user_id = auth.uid() or public.is_super_admin());
