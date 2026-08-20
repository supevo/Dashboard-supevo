-- Manueller Haken „SEPA eingereicht" je Rechnung: wann die Lastschrift bei der
-- Bank eingereicht wurde. Rein zum Abhaken – keine Automatik.
set lock_timeout = '5s';

alter table public.invoices
  add column if not exists sepa_submitted_at timestamptz;
