-- =============================================================================
-- Migration 0085 – Geburtstage: Kalender, Badge, Titelbild & Lootbox
--
-- Geburtsdatum kommt aus employee_hr_profiles (vom Mitarbeiter selbst
-- pflegbar). Am Geburtstag: Happy-Birthday-Badge + Geburtstags-Titelbild (beide
-- rein abgeleitet/angezeigt, nicht dauerhaft gespeichert) und EINE Lootbox.
--
-- ANTI-GLITCH: Da der Mitarbeiter sein Geburtsdatum frei ändern kann, darf die
-- Belohnung nicht farmbar sein. birthday_grants hält pro (Nutzer, Kalenderjahr)
-- höchstens EINEN Eintrag – Primärschlüssel (user_id, year). Die Lootbox wird
-- nur beim erstmaligen Einfügen dieses Jahres vergeben (on conflict do nothing).
-- Selbst wenn jemand das Datum auf „heute" setzt, gibt es genau eine Belohnung
-- pro Kalenderjahr – wie bei allen anderen auch. Badge & Titelbild erscheinen
-- nur am tatsächlichen Tag (heute == Tag/Monat des Geburtsdatums) und sind rein
-- kosmetisch, also ebenfalls nicht farmbar.
-- =============================================================================

-- Opt-out: Geburtstag im Team-Kalender anzeigen (Standard: ja).
alter table public.employee_hr_profiles
  add column if not exists show_birthday boolean not null default true;

create table if not exists public.birthday_grants (
  user_id uuid not null references public.profiles(id) on delete cascade,
  year integer not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  box_tier text not null default 'rare' check (box_tier in ('common', 'rare', 'super')),
  granted_at timestamptz not null default now(),
  primary key (user_id, year)
);
create index if not exists birthday_grants_org_idx
  on public.birthday_grants (organization_id, year);

alter table public.birthday_grants enable row level security;

-- Read: the person themselves, or an org admin / super_admin of the row's org.
-- Writes happen exclusively via the service client (grant engine / cron) after
-- the anti-glitch check, so there are no insert/update/delete policies.
create policy birthday_grants_select on public.birthday_grants
  for select using (
    user_id = auth.uid()
    or public.is_org_admin(organization_id)
  );

-- New notification type for the birthday greeting. NOTE: an enum value cannot be
-- added and used in the same transaction — run this line on its own if your
-- migration runner wraps files in a transaction.
alter type public.notification_type add value if not exists 'birthday';
