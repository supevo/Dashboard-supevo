-- =============================================================================
-- Migration 0095 – Drucksachen-Abrechnung
--
-- Manche Kunden lassen Drucksachen (Flyer, Visitenkarten, Plakate …) über uns
-- produzieren. Pro Kunde einstellbar, ob solche Druckprodukte abgerechnet werden.
--
-- Ist die Abrechnung aktiv und eine Aufgabe wird als „Fertig" markiert, deren
-- Beschreibung auf ein Druckprodukt hindeutet (KI/Heuristik), bekommt die Aufgabe
-- den Status print_billing_status = 'required'. Der Mitarbeiter lädt dann die
-- Lieferanten-/Dienstleister-Rechnung hoch – diese landet im internen Bereich
-- „Ausgaben" (nur Super-Admin) als print_expenses-Eintrag; die Aufgabe wird auf
-- 'settled' gesetzt.
-- =============================================================================

alter table public.client_companies
  add column if not exists bill_print_products boolean not null default false;

-- null = nicht relevant, 'required' = Rechnung fehlt, 'settled' = hochgeladen.
alter table public.tasks
  add column if not exists print_billing_status text
    check (print_billing_status in ('required', 'settled'));

create table if not exists public.print_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid references public.client_companies(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  file_mime text,
  file_size bigint,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  supplier text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists print_expenses_org_idx
  on public.print_expenses (organization_id, created_at desc);

alter table public.print_expenses enable row level security;

-- Lesen: Org-Admins/Super-Admin (der „Ausgaben"-Bereich ist intern).
create policy print_expenses_read on public.print_expenses
  for select
  using (
    public.is_org_admin(organization_id)
    and organization_id in (select public.current_user_org_ids())
  );

-- Anlegen: jedes Agentur-Teammitglied der Organisation (lädt die Rechnung hoch).
create policy print_expenses_insert on public.print_expenses
  for insert
  with check (
    public.is_agency_staff()
    and organization_id in (select public.current_user_org_ids())
  );

-- Löschen: nur Org-Admins/Super-Admin.
create policy print_expenses_delete on public.print_expenses
  for delete
  using (
    public.is_org_admin(organization_id)
    and organization_id in (select public.current_user_org_ids())
  );
