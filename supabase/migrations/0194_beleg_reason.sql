-- Finanzen: Wird eine Buchung als „kein Beleg nötig" markiert, muss ein Grund
-- angegeben werden. Der Grund wird beim Steuerberater-Export mit ausgegeben.

alter table public.bookkeeping_transactions
  add column if not exists beleg_nicht_noetig_grund text;

notify pgrst, 'reload schema';
