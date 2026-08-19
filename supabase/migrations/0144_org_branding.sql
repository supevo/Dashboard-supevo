-- =============================================================================
-- Migration 0144 – Org-Branding: eigenes Logo (zwei Varianten) fürs Dashboard
-- und für erzeugte Medien (Rechnungen, Verträge).
--   logo_dark  = dunkles Logo für HELLE Hintergründe (Rechnung/Vertrag, Light-UI)
--   logo_light = helles Logo für DUNKLE Hintergründe (Dark-UI)
-- Gespeichert als data-URI (base64, PNG/JPG). Klein gehalten.
-- =============================================================================
create table if not exists public.org_branding (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  logo_dark text,
  logo_light text,
  updated_at timestamptz not null default now()
);

alter table public.org_branding enable row level security;

-- Lesen: alle Mitglieder der Org (Agentur + Kunden sehen das Header-Logo).
create policy org_branding_select on public.org_branding
  for select using (
    organization_id in (select public.current_user_org_ids())
    or public.is_super_admin()
  );
-- Schreiben: nur Org-Admins.
create policy org_branding_admin on public.org_branding
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create trigger org_branding_set_updated_at
  before update on public.org_branding
  for each row execute function public.set_updated_at();
