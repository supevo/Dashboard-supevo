-- =============================================================================
-- 0134 – Promotions als einlösbarer Gutschein (Rabatt)
-- Optionaler Wert je Promotion: fester Betrag oder Prozent-Rabatt. Wird im
-- Konfigurator eingelöst und vom Paketpreis abgezogen (Werbebudget bleibt außen
-- vor). discount_value: bei 'fixed' in Cent, bei 'percent' als ganze Prozent.
-- =============================================================================
alter table public.promotions
  add column if not exists discount_kind text not null default 'none'
    check (discount_kind in ('none', 'fixed', 'percent')),
  add column if not exists discount_value integer not null default 0;
