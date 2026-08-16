-- =============================================================================
-- 0130 – Add-on als Referenz auf ein bestehendes Modul
-- Statt Freitext-Add-on referenziert ein Modul jetzt ein ANDERES Modul als
-- Add-on (dessen eigener Preis zählt, sobald es aktiviert wird). Google Ads
-- bekommt „Google Business" als Pflicht-Add-on.
-- =============================================================================
alter table public.membership_modules
  add column if not exists addon_module_key text;

do $$
declare
  o record;
  c_ads uuid;
begin
  for o in select id from public.organizations loop
    select id into c_ads from public.membership_module_categories
      where organization_id = o.id and name = 'Ads';

    -- „Google Business" als eigenes Modul (falls noch nicht vorhanden).
    insert into public.membership_modules
      (organization_id, category_id, key, label, description, pricing_kind,
       net_cents, icon, position, active)
    values
      (o.id, c_ads, 'google_business', 'Google Business',
       'Einrichtung & Pflege des Google-Business-Profils.',
       'flat', 9900, '🏢', 6, true)
    on conflict (organization_id, key) do nothing;

    -- Google Ads → Google Business als Pflicht-Add-on verknüpfen.
    update public.membership_modules
       set addon_module_key = 'google_business', addon_required = true
     where organization_id = o.id and key = 'google_ads';
  end loop;
end $$;
