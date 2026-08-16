-- =============================================================================
-- 0128 – Icon pro Modul (Emoji, im Stil der Dashboard-Icons)
-- Im Backend wählbar, wird im Baukasten pro Paket angezeigt.
-- =============================================================================
alter table public.membership_modules
  add column if not exists icon text;

-- Sinnvolle Standard-Icons für die vorbefüllten Module (nur wenn noch leer).
update public.membership_modules set icon = case key
    when 'supevo_stage1' then '⭐'
    when 'supevo_stage2' then '⭐'
    when 'web_paket' then '🌐'
    when 'wartung' then '🛠️'
    when 'seo_beitraege' then '📝'
    when 'google_ads' then '🎯'
    else icon
  end
where icon is null
  and key in ('supevo_stage1', 'supevo_stage2', 'web_paket', 'wartung', 'seo_beitraege', 'google_ads');
