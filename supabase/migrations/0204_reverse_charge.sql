-- =============================================================================
-- Migration 0204 – Reverse-Charge (innergemeinschaftliche B2B-Leistung)
--
-- Für Kunden im EU-Ausland (z. B. Luxemburg) wird die Leistung in Deutschland
-- NICHT besteuert – der Leistungsempfänger schuldet die USt selbst
-- (Reverse-Charge, §13b UStG / Art. 44 MwStSystRL). Auf der Rechnung: 0 % USt,
-- Netto = Brutto, Pflichthinweis „Steuerschuldnerschaft des Leistungsempfängers".
--
-- Erkennung erfolgt AUTOMATISCH anhand des hinterlegten Kundenlandes
-- (client_memberships.billing_country) – kein manueller Schalter. Der beim
-- Erstellen ermittelte Wert wird auf der Rechnung KOPIERT
-- (invoices.reverse_charge), damit bestehende Rechnungen stabil bleiben, auch
-- wenn sich das Land später ändert – analog zu payment_method.
-- =============================================================================

alter table public.invoices
  add column if not exists reverse_charge boolean not null default false;
