-- =============================================================================
-- 0132 – Promotions (aktuelle Aktionen)
-- Frei pflegbare Aktionen je Organisation, z. B. „400 € Google Ads Werbebudget
-- gratis" samt Konditionen. Mehrere gleichzeitig möglich, im Backend änderbar
-- (kein Deploy). Anzeige-Reihenfolge über position; nur aktive werden ausgespielt.
-- =============================================================================

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  -- Konditionen / Kleingedrucktes (wird unter dem Titel angezeigt).
  conditions text not null default '',
  -- Emoji-Icon im Stil der Dashboard-Icons (optional).
  icon text,
  -- Optional befristet: nur bis zu diesem Datum aktiv (null = unbefristet).
  valid_until date,
  position double precision not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists promotions_org_idx
  on public.promotions (organization_id, position);

alter table public.promotions enable row level security;

drop policy if exists promotions_all on public.promotions;
create policy promotions_all on public.promotions
  for all using (public.is_org_admin(organization_id) or public.is_super_admin())
  with check (public.is_org_admin(organization_id) or public.is_super_admin());

drop trigger if exists promotions_set_updated_at on public.promotions;
create trigger promotions_set_updated_at
  before update on public.promotions
  for each row execute function public.set_updated_at();
