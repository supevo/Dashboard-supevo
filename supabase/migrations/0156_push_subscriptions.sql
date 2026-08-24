-- Web-Push-Abos je Nutzer (PWA / Benachrichtigung aufs Gerät).
-- Ein Nutzer kann mehrere Geräte/Browser haben → mehrere Zeilen pro user_id.
set lock_timeout = '5s';

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- Zugriff nur über den Service-Client in autorisiertem Server-Code
-- (Abo speichern/löschen nach requireUser, Versand im Server).
alter table public.push_subscriptions enable row level security;
