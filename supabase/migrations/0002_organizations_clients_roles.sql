-- =============================================================================
-- Migration 0002 – Organizations, client companies, roles & audit
-- Adds client_companies, client_contacts and the append-only activity_log,
-- wires the invitations FK, and introduces write policies plus DB-level guards
-- for the management features (Phase 2).
-- =============================================================================

-- --- Enums -------------------------------------------------------------------
create type activity_action as enum (
  'create', 'update', 'delete', 'status_change', 'role_change',
  'login', 'logout', 'invite', 'invite_revoke', 'invite_resend',
  'member_deactivate', 'member_reactivate'
);

-- --- profiles: denormalized email for convenient member listings ------------
alter table public.profiles add column email text;

-- --- client_companies --------------------------------------------------------
create table public.client_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  contact_email text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, name)
);
create index client_companies_org_idx on public.client_companies (organization_id);
create trigger client_companies_set_updated_at
  before update on public.client_companies
  for each row execute function public.set_updated_at();

-- --- client_contacts ---------------------------------------------------------
create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (client_company_id, user_id)
);
create index client_contacts_user_idx on public.client_contacts (user_id);
create index client_contacts_company_idx on public.client_contacts (client_company_id);

-- --- invitations FK to client_companies -------------------------------------
alter table public.invitations
  add constraint invitations_client_company_fk
  foreign key (client_company_id)
  references public.client_companies(id) on delete cascade;

-- --- activity_log (append-only) ---------------------------------------------
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action activity_action not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_org_created_idx on public.activity_log (organization_id, created_at desc);
create index activity_log_entity_idx on public.activity_log (entity_type, entity_id);

-- =============================================================================
-- Additional RLS helper
-- =============================================================================
create or replace function public.current_user_client_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select cc.client_company_id
  from public.client_contacts cc
  where cc.user_id = auth.uid();
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.client_companies enable row level security;
alter table public.client_contacts enable row level security;
alter table public.activity_log enable row level security;

-- client_companies: agency staff see all in their org; clients see only their
-- own company. Only org admins may create/update.
create policy client_companies_select on public.client_companies
  for select using (
    deleted_at is null
    and (
      (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
      or id in (select public.current_user_client_company_ids())
      or public.is_super_admin()
    )
  );
create policy client_companies_insert on public.client_companies
  for insert with check (public.is_org_admin(organization_id));
create policy client_companies_update on public.client_companies
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- client_contacts: org admins and agency staff of the org may read; a user may
-- read their own contact rows. Only org admins may write.
create policy client_contacts_select on public.client_contacts
  for select using (
    user_id = auth.uid()
    or (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
create policy client_contacts_insert on public.client_contacts
  for insert with check (public.is_org_admin(organization_id));
create policy client_contacts_delete on public.client_contacts
  for delete using (public.is_org_admin(organization_id));

-- memberships write policies (Phase 2). DB-level guards:
--  * super_admin can never be granted through a normal (non-service) session.
--  * no one may modify their OWN membership (prevents self-escalation).
create policy memberships_insert_admin on public.memberships
  for insert with check (
    public.is_org_admin(organization_id) and role <> 'super_admin'
  );
create policy memberships_update_admin on public.memberships
  for update using (
    public.is_org_admin(organization_id) and user_id <> auth.uid()
  )
  with check (
    public.is_org_admin(organization_id) and role <> 'super_admin'
  );

-- invitations write policies. role <> super_admin already enforced by the
-- table check constraint from migration 0001.
create policy invitations_insert_admin on public.invitations
  for insert with check (
    public.is_org_admin(organization_id)
    and (invited_by = auth.uid() or public.is_super_admin())
  );
create policy invitations_update_admin on public.invitations
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- activity_log: append-only. Insert by the acting user; read by org admins.
create policy activity_log_insert on public.activity_log
  for insert with check (
    actor_id = auth.uid() or public.is_super_admin()
  );
create policy activity_log_select on public.activity_log
  for select using (
    public.is_super_admin() or public.is_org_admin(organization_id)
  );
-- No update/delete policies -> updates/deletes are denied (tamper protection).
