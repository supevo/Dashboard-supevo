-- =============================================================================
-- Migration 0111 – Lootbox: Gewichtung pro Box-Stufe
--
-- Bisher gehörte ein Item zu genau einer Box (box_tier) mit einem Gewicht.
-- Jetzt kann jedes Item in jeder Box vorkommen – mit eigener Gewichtung je
-- Stufe (0 = in dieser Box nicht enthalten). box_tier/weight bleiben als Legacy
-- bestehen (fürs Ziehen nicht mehr genutzt), damit nichts bricht.
-- =============================================================================

alter table public.loot_items
  add column if not exists weight_common integer not null default 0 check (weight_common >= 0),
  add column if not exists weight_rare integer not null default 0 check (weight_rare >= 0),
  add column if not exists weight_super integer not null default 0 check (weight_super >= 0);

-- Bestehende Items verlustfrei übernehmen: das alte Gewicht in die Stufe der
-- bisherigen Box eintragen (nur wenn noch nicht gesetzt → idempotent).
update public.loot_items set weight_common = weight where box_tier = 'common' and weight_common = 0;
update public.loot_items set weight_rare = weight where box_tier = 'rare' and weight_rare = 0;
update public.loot_items set weight_super = weight where box_tier = 'super' and weight_super = 0;
