-- =============================================================================
-- Migration 0049 – Generische Nutzer-Zähler (für Sammel-Badges)
--
-- Viele Badges lassen sich aus vorhandenen Tabellen ableiten (erstellte
-- Aufgaben, Chat-Nachrichten, Urlaube …). Reine UI-Aktionen ohne eigene
-- Persistenz (Theme-Wechsel, DND-Schalter, Bild-Tausch …) haben keinen
-- natürlichen Zähler – dafür dieser generische Key→Count-Speicher.
-- =============================================================================

create table if not exists public.user_counters (
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_counters enable row level security;

create policy user_counters_select on public.user_counters
  for select using (
    user_id = auth.uid()
    or (
      public.is_agency_staff()
      and organization_id in (select public.current_user_org_ids())
    )
    or public.is_super_admin()
  );
create policy user_counters_insert on public.user_counters
  for insert with check (user_id = auth.uid() or public.is_super_admin());
create policy user_counters_update on public.user_counters
  for update using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());
