-- =============================================================================
-- Migration 0053 – Hochladbare Level-Hub-Titelbilder
--
-- Ergänzt die im Code definierten Verlaufs-Titelbilder um eigene, pro
-- Organisation hochgeladene Bilder. Jedes Bild hat ein Freischalt-Level; im
-- Level Hub passt sich das angezeigte Titelbild automatisch dem Level an
-- (höchstes freigeschaltetes Bild), kann aber weiterhin manuell gewählt werden.
--
-- Die Bilddatei liegt im vorhandenen "files"-Bucket; hier steht nur der
-- Storage-Pfad + die Metadaten.
-- =============================================================================

create table if not exists public.hub_banner_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  unlock_level integer not null default 0 check (unlock_level >= 0 and unlock_level <= 999),
  storage_path text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists hub_banner_images_org_idx
  on public.hub_banner_images (organization_id, unlock_level);

alter table public.hub_banner_images enable row level security;

-- Alle Agentur-Mitarbeiter der Org dürfen die Titelbilder sehen (für den Hub).
create policy hub_banner_images_select on public.hub_banner_images
  for select using (
    public.is_agency_staff()
    and organization_id in (select public.current_user_org_ids())
  );

-- Anlegen/Ändern/Löschen nur durch Org-Admins.
create policy hub_banner_images_write on public.hub_banner_images
  for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
