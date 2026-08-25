-- Lead→Kunde: Gutschein und versprochenes (einmaliges) Google-Ads-Guthaben in
-- die Mitgliedschaft übernehmen, damit das Angebot vom Termin 1:1 ankommt.
set lock_timeout = '5s';

alter table public.client_memberships
  add column if not exists redeemed_promotions text[] not null default '{}';

-- Einmaliges Google-Ads-Guthaben (in Cent) + Einlöse-Zeitpunkt.
alter table public.client_memberships
  add column if not exists ads_credit_cents integer not null default 0;
alter table public.client_memberships
  add column if not exists ads_credit_redeemed_at timestamptz;
