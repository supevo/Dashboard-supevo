-- =============================================================================
-- 0123 – KI-Nutzung protokollieren (Token-Verbrauch je Aufruf)
-- Für die Kosten-/Kontingent-Sicht im Diagnose-Tab. Erfasst wird pro
-- KI-Aufruf (v. a. Beleg-/Kontoauszug-Auslesen) das Modell + Token.
-- =============================================================================
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model text not null,
  -- 'receipt' | 'bank' | 'text' – wofür der Aufruf war.
  purpose text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_events_org_time_idx
  on public.ai_usage_events (organization_id, created_at desc);

alter table public.ai_usage_events enable row level security;
drop policy if exists ai_usage_events_select on public.ai_usage_events;
create policy ai_usage_events_select on public.ai_usage_events
  for select using (public.is_org_admin(organization_id) or public.is_super_admin());
drop policy if exists ai_usage_events_insert on public.ai_usage_events;
create policy ai_usage_events_insert on public.ai_usage_events
  for insert with check (public.is_org_admin(organization_id) or public.is_super_admin());
