-- =============================================================================
-- Migration 0001 – Foundation
-- Enums, core tenant tables (organizations, profiles, memberships,
-- invitations), RLS helper functions and base policies.
--
-- Security model: Row Level Security is the hard boundary. Helper functions
-- are SECURITY DEFINER so they can read membership rows without recursing
-- through RLS. All tenant scoping derives from auth.uid(), never from
-- client-supplied identifiers.
-- =============================================================================

create extension if not exists "pgcrypto";

-- --- Enums -------------------------------------------------------------------
create type organization_type as enum ('agency', 'client');
create type membership_status as enum ('invited', 'active', 'suspended');
create type app_role as enum (
  'super_admin', 'agency_admin', 'project_manager',
  'employee', 'freelancer', 'client', 'guest'
);

-- --- updated_at trigger helper ----------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --- organizations -----------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type organization_type not null,
  slug text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- --- profiles (extends auth.users) ------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  locale text not null default 'de',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- --- memberships -------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role app_role not null,
  status membership_status not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, organization_id)
);
create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_org_role_idx on public.memberships (organization_id, role);
create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

-- --- invitations -------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid, -- FK added in a later migration with client_companies
  email text not null,
  role app_role not null,
  token_hash text not null,
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_token_hash_idx on public.invitations (token_hash);
create index invitations_email_idx on public.invitations (lower(email));
-- Only one active invitation per email + organization.
create unique index invitations_active_unique
  on public.invitations (organization_id, lower(email))
  where accepted_at is null and revoked_at is null;
-- super_admin can never be granted via an invitation.
alter table public.invitations
  add constraint invitations_role_not_super_admin
  check (role <> 'super_admin');

-- =============================================================================
-- RLS helper functions (SECURITY DEFINER – bypass RLS to avoid recursion)
-- =============================================================================
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.role = 'super_admin'
      and m.status = 'active'
  );
$$;

create or replace function public.is_agency_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('agency_admin','project_manager','employee','freelancer')
  );
$$;

create or replace function public.current_user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.organization_id from public.memberships m
  where m.user_id = auth.uid() and m.status = 'active';
$$;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.organization_id = p_org_id
      and m.status = 'active'
      and m.role = 'agency_admin'
  ) or public.is_super_admin();
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;

-- organizations: members of an org may read it; admins may update it.
create policy organizations_select on public.organizations
  for select using (
    id in (select public.current_user_org_ids()) or public.is_super_admin()
  );
create policy organizations_update on public.organizations
  for update using (public.is_org_admin(id)) with check (public.is_org_admin(id));

-- profiles: a user manages their own profile.
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.is_super_admin());
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- memberships: a user reads their own memberships; org admins read all in
-- their org. (Write paths are added in Phase 2 with the management UI.)
create policy memberships_select_own on public.memberships
  for select using (
    user_id = auth.uid()
    or public.is_org_admin(organization_id)
  );

-- invitations: agency admins of the org may read them. Creation/acceptance
-- runs through the service client with explicit server-side checks.
create policy invitations_select_admin on public.invitations
  for select using (public.is_org_admin(organization_id));
