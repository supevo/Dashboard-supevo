-- Rechnungsempfänger je Kunde: an diese Adresse wird die Rechnung per „Absenden"
-- geschickt. Fällt leer auf die allgemeine Kontakt-E-Mail zurück.
alter table public.client_companies
  add column if not exists invoice_recipient_email text;
