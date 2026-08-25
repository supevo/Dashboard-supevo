-- „Basis-Modul" je Modul: markiert das Modul, dessen Auswahl das „Aus Angebot
-- erzeugen" freischaltet (z. B. supevo Smart). Unabhängig vom Preistyp – vorher
-- war die Freischaltung hart an ein Stufen-Modul (stage) gekoppelt.
set lock_timeout = '5s';

alter table public.membership_modules
  add column if not exists plan_is_base boolean not null default false;
