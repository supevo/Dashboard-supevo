-- =============================================================================
-- Migration 0064 – Titelbilder vorzeitig mit Coins kaufen
--
-- Level-Titelbilder können optional einen Coin-Preis bekommen. Ist er gesetzt
-- (> 0), kann man das Titelbild vor Erreichen des Levels mit Coins freischalten.
-- Freigeschaltete Käufe werden – wie exklusive Banner – als achievements-Eintrag
-- 'banner_<id>' gespeichert.
-- =============================================================================

alter table public.hub_banner_images
  add column if not exists coin_price integer not null default 0
    check (coin_price >= 0);
