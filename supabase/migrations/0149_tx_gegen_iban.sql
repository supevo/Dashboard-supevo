-- Gegen-IBAN (Zahler/Empfänger) je Bankbuchung. Wird beim Abgleich gegen die
-- (gelernte) IBAN eines Kunden geprüft – ein eindeutiges Zuordnungssignal.
set lock_timeout = '5s';

alter table public.bookkeeping_transactions
  add column if not exists gegen_iban text;

create index if not exists bookkeeping_transactions_gegen_iban_idx
  on public.bookkeeping_transactions (billing_entity_id, gegen_iban)
  where gegen_iban is not null;
