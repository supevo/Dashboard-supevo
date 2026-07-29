-- =============================================================================
-- Migration 0060 – Header-Banner als exklusive Lootbox-Items
--
-- Titelbilder (hub_banner_images) können jetzt "exklusiv" sein: sie lassen sich
-- NICHT über das Level freischalten, sondern nur, indem man sie aus einer
-- Lootbox zieht und einlöst. Ein Lootbox-Item vom Typ 'banner' verweist auf ein
-- solches Titelbild; beim Einlösen wird es dem Profil gutgeschrieben (über die
-- vorhandene achievements-Tabelle, Schlüssel 'banner_<bannerId>').
-- =============================================================================

-- Exklusiv-Flag für Titelbilder (nur über Lootbox erhältlich).
alter table public.hub_banner_images
  add column if not exists exclusive boolean not null default false;

-- Lootbox-Items dürfen jetzt auch Titelbilder sein.
alter table public.loot_items drop constraint if exists loot_items_type_check;
alter table public.loot_items
  add constraint loot_items_type_check check (type in ('physical', 'badge', 'banner'));

alter table public.loot_items
  add column if not exists banner_image_id uuid
    references public.hub_banner_images(id) on delete cascade;

-- Inventar merkt sich das Titelbild, damit das Einlösen es freischalten kann.
alter table public.loot_inventory
  add column if not exists banner_image_id uuid
    references public.hub_banner_images(id) on delete set null;
