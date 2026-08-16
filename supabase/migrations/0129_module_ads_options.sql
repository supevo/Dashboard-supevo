-- =============================================================================
-- 0129 – Zusatz-Optionen pro Modul (v. a. Google Ads)
--  * budget_via_options: Zahlweise-Auswahl (über uns / direkt an Google)
--  * keyword_cents/keyword_default: Preis skaliert mit Anzahl Keywords
--  * addon_label/addon_cents/addon_required: kostenpflichtiges Add-on (z. B.
--    Google Business); required = Must-Have (immer enthalten).
-- Preise unten sind Platzhalter – im Backend anpassbar.
-- =============================================================================
alter table public.membership_modules
  add column if not exists budget_via_options boolean not null default false;
alter table public.membership_modules
  add column if not exists keyword_cents integer not null default 0;
alter table public.membership_modules
  add column if not exists keyword_default integer not null default 0;
alter table public.membership_modules
  add column if not exists addon_label text;
alter table public.membership_modules
  add column if not exists addon_cents integer not null default 0;
alter table public.membership_modules
  add column if not exists addon_required boolean not null default false;

-- Google-Ads-Modul mit den neuen Optionen vorbelegen (Platzhalterpreise).
update public.membership_modules
   set budget_via_options = true,
       keyword_cents = case when keyword_cents = 0 then 1500 else keyword_cents end,
       keyword_default = case when keyword_default = 0 then 10 else keyword_default end,
       addon_label = coalesce(addon_label, 'Google Business'),
       addon_cents = case when addon_cents = 0 then 9900 else addon_cents end,
       addon_required = true
 where key = 'google_ads';
