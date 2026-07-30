-- =============================================================================
-- Migration 0072 – Profilrahmen (Level-Hub)
--
-- Hochladbare Profilrahmen, die im Level Hub den XP-Ring um das Profilbild
-- ersetzen. Jeder Rahmen hat ein Freischalt-Level (ab welchem Level wählbar)
-- ODER ist "exklusiv" – dann nur über Lootboxen erhältlich (Sonderrahmen).
--
-- Aufbau spiegelt die Titelbilder (hub_banner_images): die PNG/SVG-Datei liegt
-- im vorhandenen "files"-Bucket, hier stehen nur Storage-Pfad + Metadaten.
-- =============================================================================

create table if not exists public.hub_frame_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  unlock_level integer not null default 0 check (unlock_level >= 0 and unlock_level <= 999),
  exclusive boolean not null default false,
  coin_price integer not null default 0 check (coin_price >= 0),
  storage_path text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists hub_frame_images_org_idx
  on public.hub_frame_images (organization_id, unlock_level);

alter table public.hub_frame_images enable row level security;

-- Alle Agentur-Mitarbeiter der Org dürfen die Rahmen sehen (für den Hub).
create policy hub_frame_images_select on public.hub_frame_images
  for select using (
    public.is_agency_staff()
    and organization_id in (select public.current_user_org_ids())
  );

-- Anlegen/Ändern/Löschen nur durch Org-Admins.
create policy hub_frame_images_write on public.hub_frame_images
  for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- Gewählter Profilrahmen pro Profil (Schlüssel "frameimg:<id>"; null = XP-Ring).
alter table public.profiles
  add column if not exists hub_frame text;

-- Lootbox-Integration: Rahmen als Item-Typ zulassen + Referenz auf den Rahmen.
alter table public.loot_items drop constraint if exists loot_items_type_check;
alter table public.loot_items
  add constraint loot_items_type_check
  check (type in ('physical', 'badge', 'banner', 'frame'));

alter table public.loot_items
  add column if not exists frame_image_id uuid
  references public.hub_frame_images(id) on delete cascade;

alter table public.loot_inventory
  add column if not exists frame_image_id uuid;
