-- Firmenphilosophie: kurze, rotierende Texte, die oben in der Übersicht
-- angezeigt werden. Von Org-Admins frei pflegbar (hinzufügen, bearbeiten,
-- pausieren, löschen). Alle Agentur-Mitarbeiter der Org sehen die aktiven Texte.

create table if not exists public.philosophy_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  text text not null,
  active boolean not null default true,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists philosophy_quotes_org_idx
  on public.philosophy_quotes (organization_id, position);

alter table public.philosophy_quotes enable row level security;

-- Alle Agentur-Mitarbeiter der Org dürfen die Texte lesen; nur Org-Admins pflegen.
create policy philosophy_quotes_select on public.philosophy_quotes
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy philosophy_quotes_admin on public.philosophy_quotes
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create trigger philosophy_quotes_set_updated_at
  before update on public.philosophy_quotes
  for each row execute function public.set_updated_at();
