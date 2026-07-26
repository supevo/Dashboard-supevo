-- =============================================================================
-- Migration 0035 – Website inquiries (webhook inbox per client)
--
-- Contact-form submissions from a client's website are POSTed to a secret,
-- per-client webhook URL and land here. The client sees them in the portal,
-- can comment, set a status (angerufen/gemailt/erledigt) and check them off.
-- Activation is per client via inquiry_endpoints.enabled.
-- =============================================================================

do $$ begin
  create type public.inquiry_status as enum ('new', 'called', 'mailed', 'done');
exception when duplicate_object then null; end $$;

alter type public.notification_type add value if not exists 'inquiry';

-- Per-client webhook endpoint: activation flag + secret token.
create table if not exists public.inquiry_endpoints (
  client_company_id uuid primary key references public.client_companies(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token text not null unique
    default replace(gen_random_uuid()::text, '-', '')
         || replace(gen_random_uuid()::text, '-', ''),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inquiry_endpoints_token_idx
  on public.inquiry_endpoints (token);

alter table public.inquiry_endpoints enable row level security;

-- Only agency staff of the org manage endpoints (the token is secret).
create policy inquiry_endpoints_all on public.inquiry_endpoints
  for all
  using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  )
  with check (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create trigger inquiry_endpoints_set_updated_at
  before update on public.inquiry_endpoints
  for each row execute function public.set_updated_at();

-- The inquiries themselves.
create table if not exists public.web_inquiries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  name text,
  email text,
  phone text,
  subject text,
  message text,
  source text,
  payload jsonb not null default '{}'::jsonb,
  status public.inquiry_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists web_inquiries_company_idx
  on public.web_inquiries (client_company_id, status, created_at desc);

alter table public.web_inquiries enable row level security;

-- Agency staff of the org and the client's own contacts may read/update.
-- Inserts happen only via the webhook (service role, bypasses RLS).
create policy web_inquiries_select on public.web_inquiries
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or client_company_id in (select public.current_user_client_company_ids())
    or public.is_super_admin()
  );
create policy web_inquiries_update on public.web_inquiries
  for update using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or client_company_id in (select public.current_user_client_company_ids())
    or public.is_super_admin()
  )
  with check (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or client_company_id in (select public.current_user_client_company_ids())
    or public.is_super_admin()
  );
create policy web_inquiries_delete on public.web_inquiries
  for delete using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );

create trigger web_inquiries_set_updated_at
  before update on public.web_inquiries
  for each row execute function public.set_updated_at();

-- Comments on an inquiry (agency + client).
create table if not exists public.inquiry_comments (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.web_inquiries(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists inquiry_comments_inquiry_idx
  on public.inquiry_comments (inquiry_id, created_at);

alter table public.inquiry_comments enable row level security;

create policy inquiry_comments_select on public.inquiry_comments
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or client_company_id in (select public.current_user_client_company_ids())
    or public.is_super_admin()
  );
create policy inquiry_comments_insert on public.inquiry_comments
  for insert with check (
    author_id = auth.uid()
    and (
      (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
      or client_company_id in (select public.current_user_client_company_ids())
    )
  );
