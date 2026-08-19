-- Währung eines Belegs (ISO-Code, z. B. USD). Null/leer = EUR. Fremdwährungs-
-- belege (Voiceflow, Meta …) werden beim Abgleich mit erweiterter Betrags-
-- toleranz behandelt, weil der Bankbetrag durch den Wechselkurs abweicht.
set lock_timeout = '5s';

alter table public.bookkeeping_receipts
  add column if not exists waehrung text;
