-- =============================================================================
-- Migration 0173 – Drucksachen: Aufschlag (Markup) pro Kunde + am Beleg
--
-- Aufschlag auf die (Brutto-)Rechnung der Druckerei, den wir dem Kunden auf der
-- monatlichen Ausgangsrechnung berechnen.
--
-- Standard (wenn kein Kunden-Wert gesetzt):
--   supevo-Mitgliedschaft (nicht-legacy, mit Mitgliedschaft) → 20 %
--   supevo Smart (is_legacy) bzw. ohne Mitgliedschaft        → 100 %
--
-- print_markup_percent am Kunden ist ein OPTIONALER Override: NULL = Standard,
-- ein Wert (z. B. 35) überschreibt den Standard für diesen Kunden.
-- =============================================================================

alter table public.client_companies
  add column if not exists print_markup_percent integer
    check (print_markup_percent is null
           or (print_markup_percent >= 0 and print_markup_percent <= 1000));

-- Am Beleg festhalten, welcher Aufschlag beim Upload galt und welcher Betrag dem
-- Kunden berechnet wird (Brutto der Druckerei + Aufschlag). Der Aufschlag wird
-- zum Upload-Zeitpunkt „eingefroren", damit spätere Tarifänderungen bereits
-- erfasste Belege nicht rückwirkend verändern.
alter table public.print_expenses
  add column if not exists markup_percent integer
    check (markup_percent is null
           or (markup_percent >= 0 and markup_percent <= 1000));
alter table public.print_expenses
  add column if not exists client_charge_cents integer
    check (client_charge_cents is null or client_charge_cents >= 0);
