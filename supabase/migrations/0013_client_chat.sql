-- =============================================================================
-- Migration 0013 – Internal client chat
--
-- A lightweight internal chat channel per client company, visible ONLY to
-- agency staff of the organization. Clients have no access (no policy grants
-- them). Used for quick internal coordination about a client.
-- =============================================================================

create table if not exists public.client_chat_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_company_id uuid not null references public.client_companies(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists client_chat_company_idx
  on public.client_chat_messages (client_company_id, created_at);

alter table public.client_chat_messages enable row level security;

create policy client_chat_select on public.client_chat_messages
  for select using (
    (
      public.is_agency_staff()
      and organization_id in (select public.current_user_org_ids())
    )
    or public.is_super_admin()
  );

create policy client_chat_insert on public.client_chat_messages
  for insert with check (
    author_id = auth.uid()
    and (
      (
        public.is_agency_staff()
        and organization_id in (select public.current_user_org_ids())
      )
      or public.is_super_admin()
    )
  );

create policy client_chat_delete on public.client_chat_messages
  for delete using (author_id = auth.uid() or public.is_super_admin());
