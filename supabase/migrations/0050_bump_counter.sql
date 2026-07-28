-- =============================================================================
-- Migration 0050 – Atomarer Zähler für Sammel-Badges (ersetzt 0049-Logik)
--
-- Selbstständig & idempotent: legt die Tabelle an, falls 0049 nie lief, und
-- fügt eine atomare Increment-Funktion hinzu. Der bisherige read-then-write in
-- der App war nicht atomar – bei 20 schnellen Klicks gingen Zählungen verloren,
-- sodass z. B. das „Michael Jackson"-Badge nie ausgelöst wurde.
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

drop policy if exists user_counters_select on public.user_counters;
create policy user_counters_select on public.user_counters
  for select using (
    user_id = auth.uid()
    or (
      public.is_agency_staff()
      and organization_id in (select public.current_user_org_ids())
    )
    or public.is_super_admin()
  );

-- Atomarer Increment: eine Zeile pro (user, key), count += 1 pro Aufruf.
create or replace function public.bump_counter(p_key text, p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.user_counters (user_id, organization_id, key, count)
  values (auth.uid(), p_org, p_key, 1)
  on conflict (user_id, key)
  do update set count = public.user_counters.count + 1, updated_at = now();
end;
$$;

grant execute on function public.bump_counter(text, uuid) to authenticated;
