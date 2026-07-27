-- =============================================================================
-- Migration 0047 – XP-Ledger (automatische Punkte)
--
-- Bisher wuchs das Level nur durch Kollegen-Kudos. Damit der Level Hub sich
-- selbst befüllt, vergeben wir XP auch automatisch: fürs Erledigen einer
-- Aufgabe ("mission"), für pünktliche Lieferung ("ontime") und für Serien
-- ("streak_N"). Bewusst getrennt von der kudos-Tabelle, damit "Hilfsbereit-
-- schaft" (= erhaltene Kudos) durch selbstverdiente XP nicht verfälscht wird.
-- =============================================================================

create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,
  points integer not null,
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Idempotenz: pro Aufgabe genau ein "mission"/"ontime"-Event je Nutzer …
create unique index if not exists xp_events_user_kind_task_idx
  on public.xp_events (user_id, kind, task_id)
  where task_id is not null;
-- … und pro Nutzer genau ein aufgabenloses Meilenstein-Event je Art (streak_N).
create unique index if not exists xp_events_user_kind_idx
  on public.xp_events (user_id, kind)
  where task_id is null;
create index if not exists xp_events_user_idx on public.xp_events (user_id);
create index if not exists xp_events_org_idx on public.xp_events (organization_id);

alter table public.xp_events enable row level security;

create policy xp_events_select on public.xp_events
  for select using (
    user_id = auth.uid()
    or (
      public.is_agency_staff()
      and organization_id in (select public.current_user_org_ids())
    )
    or public.is_super_admin()
  );
create policy xp_events_insert on public.xp_events
  for insert with check (user_id = auth.uid() or public.is_super_admin());
