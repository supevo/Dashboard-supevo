-- Storno nachvollziehbar machen: wer hat wann und warum storniert. Die Rechnung
-- (Nummer + PDF) bleibt als Beleg erhalten, sie wird nur auf „void" gesetzt.
set lock_timeout = '5s';

alter table public.invoices
  add column if not exists void_reason text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null;
