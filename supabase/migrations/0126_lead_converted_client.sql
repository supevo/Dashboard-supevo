-- =============================================================================
-- 0126 – Lead → Kunde: Verknüpfung merken
-- Hält fest, in welchen Kunden ein gewonnener Lead umgewandelt wurde
-- (verhindert Doppel-Anlage, macht die Konvertierung nachvollziehbar).
-- =============================================================================
alter table public.leads
  add column if not exists converted_client_company_id uuid
    references public.client_companies(id) on delete set null;
