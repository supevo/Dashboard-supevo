-- Rechnungs-/Vertragsadresse schon am Lead erfassen: nach deutschem Recht müssen
-- die Vertragsparteien mit Anschrift im Vertrag stehen. Die Adresse fließt in den
-- Lead-Vertrag und wird bei der Umwandlung in die Mitgliedschaft übernommen.
set lock_timeout = '5s';

alter table public.leads
  add column if not exists billing_address_line1 text;
alter table public.leads
  add column if not exists billing_address_line2 text;
alter table public.leads
  add column if not exists billing_postal_code text;
alter table public.leads
  add column if not exists billing_city text;
alter table public.leads
  add column if not exists billing_country text;
