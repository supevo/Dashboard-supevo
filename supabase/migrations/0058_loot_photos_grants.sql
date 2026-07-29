-- =============================================================================
-- Migration 0058 – Loot-Fotos, Box-Artwork & verschenkbare Boxen
--
-- 1. Foto je Loot-Item (physische Belohnung) + Snapshot im Inventar.
-- 2. Box-Artwork je Stufe (common/rare/super) – ersetzt das Emoji im Shop.
-- 3. loot_grants: Admins können Mitarbeitern Gratis-Boxen schenken (zum Testen
--    oder in besonderen Challenge-Wochen). Eine offene Zeile = eine Gratis-Box,
--    die ohne Coins geöffnet werden kann. Zugriff über den Service-Client nach
--    App-Prüfung, daher RLS aktiv ohne zusätzliche Policy (Default deny).
-- =============================================================================

alter table public.loot_items add column if not exists image_path text;
alter table public.loot_inventory add column if not exists image_path text;

alter table public.loot_config add column if not exists image_common text;
alter table public.loot_config add column if not exists image_rare text;
alter table public.loot_config add column if not exists image_super text;

create table if not exists public.loot_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  box_tier text not null check (box_tier in ('common', 'rare', 'super')),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  opened_at timestamptz
);

create index if not exists loot_grants_user_open_idx
  on public.loot_grants (user_id, box_tier, opened_at);

alter table public.loot_grants enable row level security;
