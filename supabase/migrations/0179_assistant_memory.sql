-- =============================================================================
-- Migration 0179 – KI-Assistent: dauerhaftes Gedächtnis (Fakten & Vorlieben)
--
-- Agenturweit geteilte Notizen, die der Assistent bei jeder Anfrage in den
-- System-Prompt lädt (z. B. „Kunde X immer intern anlegen", Tonfall, Standard-
-- Projekt). So wirkt der Assistent, als würde er dazulernen, ohne echtes
-- Fine-Tuning. Pflegbar von Agentur-Mitarbeitern der Organisation.
-- =============================================================================

create table if not exists public.assistant_memory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists assistant_memory_org_idx
  on public.assistant_memory (organization_id, created_at desc);

alter table public.assistant_memory enable row level security;

-- Lesen/Schreiben: Agentur-Mitarbeiter der Organisation (bzw. Super-Admin).
create policy assistant_memory_select on public.assistant_memory
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy assistant_memory_insert on public.assistant_memory
  for insert with check (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy assistant_memory_delete on public.assistant_memory
  for delete using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
