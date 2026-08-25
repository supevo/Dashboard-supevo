-- Umsetzungs-Verhalten je Modul: steuert, was beim „Aus Angebot erzeugen" pro
-- Modul entsteht – Marketingplan-Maßnahme und/oder Aufgabe (Warteschlange,
-- wiederkehrend), ob nach Menge vervielfacht und ob über Wochen gestreckt.
set lock_timeout = '5s';

alter table public.membership_modules
  add column if not exists plan_include boolean not null default false;
alter table public.membership_modules
  add column if not exists plan_phase smallint;
-- 'none' | 'queue' (einmal in Warteschlange) | 'recurring' (wiederkehrend/Dauer)
alter table public.membership_modules
  add column if not exists task_mode text not null default 'none';
-- Nach Menge vervielfachen (2 Landingpages = 2 Aufgaben).
alter table public.membership_modules
  add column if not exists task_per_qty boolean not null default false;
-- Für wiederkehrende Aufgaben: 'weekly' | 'monthly'.
alter table public.membership_modules
  add column if not exists task_recurring_freq text;
-- Warteschlangen-Aufgaben mit gestaffelten Fälligkeiten über die Wochen verteilen.
alter table public.membership_modules
  add column if not exists task_stretch_weeks boolean not null default false;
