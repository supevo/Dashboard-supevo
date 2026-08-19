-- Externe Transaktions-/Referenznummer je Rechnung (z. B. Stripe-/PayPal-/
-- Bestellnummer). Wird beim Bankabgleich zusätzlich zur Rechnungsnummer gegen
-- den Verwendungszweck geprüft.
set lock_timeout = '5s';

alter table public.invoices
  add column if not exists payment_ref text;
