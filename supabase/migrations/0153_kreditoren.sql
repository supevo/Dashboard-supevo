-- Kreditoren-/Verrechnungskonten: Anbieter (z. B. Google, Meta), deren Rechnungen
-- und Zahlungen NICHT 1:1 zugeordnet werden, sondern beide gegen ein
-- Kreditorenkonto laufen. Der Saldo (Aufwand − Zahlungen) gleicht sich über die
-- Monate aus. Gespeichert werden die Anbieternamen (klein/normalisiert wird zur
-- Laufzeit).
set lock_timeout = '5s';

alter table public.accounting_profiles
  add column if not exists kreditoren text[] not null default '{}';
