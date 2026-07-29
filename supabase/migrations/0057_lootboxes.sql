-- =============================================================================
-- Migration 0057 – Digitale Währung (Coins) + Lootboxen + Inventar
--
-- Coins werden aus den XP abgeleitet (floor(gesamt-XP / xp_per_coin) minus
-- ausgegebene Coins). Gegen Coins öffnet man Lootboxen (common/rare/super); der
-- Inhalt wird per Gewicht (Seltenheit) gezogen und landet als Snapshot im
-- Inventar. Einlösen: physisch → Benachrichtigung an Admins; Badge → direkt.
-- Alles admin-konfigurierbar. Zugriff über Service-Client nach App-Prüfung.
-- =============================================================================

create table if not exists public.loot_config (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  xp_per_coin integer not null default 10 check (xp_per_coin >= 1),
  price_common integer not null default 20 check (price_common >= 0),
  price_rare integer not null default 50 check (price_rare >= 0),
  price_super integer not null default 120 check (price_super >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.loot_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  box_tier text not null check (box_tier in ('common', 'rare', 'super')),
  name text not null,
  description text,
  type text not null check (type in ('physical', 'badge')),
  weight integer not null default 1 check (weight >= 1),
  badge_emoji text,
  badge_name text,
  created_at timestamptz not null default now()
);
create index if not exists loot_items_org_tier_idx on public.loot_items (organization_id, box_tier);

create table if not exists public.loot_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  coins_spent integer not null default 0 check (coins_spent >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.loot_inventory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  type text not null,
  badge_emoji text,
  badge_name text,
  box_tier text,
  status text not null default 'new' check (status in ('new', 'requested', 'fulfilled')),
  won_at timestamptz not null default now(),
  redeemed_at timestamptz
);
create index if not exists loot_inventory_user_idx on public.loot_inventory (user_id, status);

alter table public.loot_config enable row level security;
alter table public.loot_items enable row level security;
alter table public.loot_wallets enable row level security;
alter table public.loot_inventory enable row level security;
