-- Vertragliche Mindestlaufzeit einer Kundenmitgliedschaft (in Monaten).
-- Rein informativ für die Mitgliedschafts-Übersicht (Vertragsende/„läuft aus"),
-- NULL = ohne feste Laufzeit / unbefristet. Kein Einfluss auf die Abrechnung.
alter table public.client_memberships
  add column if not exists term_months integer;

comment on column public.client_memberships.term_months is
  'Vertragliche Mindestlaufzeit in Monaten (NULL = ohne feste Laufzeit).';
