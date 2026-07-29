-- =============================================================================
-- Migration 0070 – Eigene Sticker im Team-Chat
--
-- Das Team lädt in den Einstellungen kleine Bilder (PNG/JPG/WebP/GIF) als
-- Sticker hoch; diese stehen allen im Chat zur Verfügung. Eine Chat-Nachricht
-- kann statt Text einen Sticker tragen (sticker_path).
-- =============================================================================

create table if not exists public.chat_stickers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  storage_path text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists chat_stickers_org_idx
  on public.chat_stickers (organization_id, created_at);

alter table public.chat_stickers enable row level security;

create policy chat_stickers_select on public.chat_stickers
  for select using (
    public.is_super_admin()
    or (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
  );
create policy chat_stickers_insert on public.chat_stickers
  for insert with check (
    public.is_agency_staff() and organization_id in (select public.current_user_org_ids())
  );
create policy chat_stickers_delete on public.chat_stickers
  for delete using (
    public.is_super_admin()
    or (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
  );

-- Eine Nachricht kann einen Sticker tragen (statt/zusätzlich zum Text).
alter table public.chat_channel_messages
  add column if not exists sticker_path text;

-- Text darf leer sein, wenn ein Sticker gesendet wird.
alter table public.chat_channel_messages
  alter column body drop not null;
