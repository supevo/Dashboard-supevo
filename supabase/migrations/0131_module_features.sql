-- =============================================================================
-- 0131 – Modul-Checkliste („Was ist enthalten") + bessere Standardtexte
-- features: Liste der enthaltenen Punkte (im Frontend max. 5 angezeigt).
-- Zusätzlich sprechendere Titel/Beschreibungen für die vorbefüllten Module.
-- =============================================================================
alter table public.membership_modules
  add column if not exists features text[] not null default '{}';

-- SEO
update public.membership_modules
   set label = 'SEO-Wachstum',
       description = 'Neue Inhalte, mit denen Sie langfristig bei Google für relevante Suchanfragen gefunden werden.',
       features = array['Regelmäßige, suchoptimierte Inhalte','Keyword- & Themenstrategie','Technisches SEO','Monatliches Reporting']
 where key = 'seo_beitraege';

-- Google Ads
update public.membership_modules
   set label = 'Google Ads – laufende Leadgewinnung',
       description = 'Wir richten Kampagnen ein, optimieren sie laufend und steuern die Anfragen.',
       features = array['Kampagnen-Setup','Laufende Optimierung','Anzeigen & Zielgruppen','Lead-Reporting']
 where key = 'google_ads';

-- Web-Paket
update public.membership_modules
   set description = coalesce(nullif(description,''), 'Ihre professionelle Website – individuell gestaltet und startklar.'),
       features = case when features = '{}' then array['Individuelles Design','Für Handy optimiert & schnell','SEO-Grundlagen','Kontaktformular & Rechtstexte'] else features end
 where key = 'web_paket';

-- Wartung & Hosting
update public.membership_modules
   set features = case when features = '{}' then array['Sicherheits-Updates','Regelmäßige Backups','Hosting inklusive','Kleine Änderungen'] else features end
 where key = 'wartung';

-- Google Business
update public.membership_modules
   set features = case when features = '{}' then array['Profil-Einrichtung','Regelmäßige Beiträge','Bewertungs-Management'] else features end
 where key = 'google_business';

-- supevo Mitgliedschaften (Komplettbetreuung)
update public.membership_modules
   set features = case when features = '{}' then array['Rundum-Betreuung','Web, SEO & Ads gebündelt','Persönlicher Ansprechpartner','Monatliche Abstimmung'] else features end
 where key in ('supevo_stage1', 'supevo_stage2');
