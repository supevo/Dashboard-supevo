-- Externe Konto-/Kundennummer eines Belegs (z. B. Google-Ads-Konto-ID
-- „154-392-4365"). Dient dem Abgleich von Anbietern wie Google, bei denen
-- Zahlungen (Vorauszahlungen/Schwellen) NICHT 1:1 zu einzelnen Rechnungen
-- passen – gruppiert wird dann je Konto-ID (im Bank-Zweck als „ADWORDS:<ID>").
set lock_timeout = '5s';

alter table public.bookkeeping_receipts
  add column if not exists konto_ref text;
