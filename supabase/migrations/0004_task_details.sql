-- =============================================================================
-- Migration 0004 – Task details: comments, mentions, files, checklists,
-- notifications, and a private storage bucket with RLS.
-- =============================================================================

create type notification_type as enum (
  'task_assigned','comment_mention','client_comment','internal_question',
  'task_in_review','task_for_approval','approval_granted','changes_requested',
  'due_date_reached','task_overdue','file_uploaded'
);

-- --- comments ----------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  is_internal boolean not null default true,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index comments_task_idx on public.comments (task_id, created_at);

create table public.comment_mentions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (comment_id, mentioned_user_id)
);

-- --- files -------------------------------------------------------------------
create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  checksum_sha256 text,
  is_internal boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index files_task_idx on public.files (task_id);
create index files_project_internal_idx on public.files (project_id, is_internal);

-- --- checklists (agency-internal working tool) ------------------------------
create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checklists_task_idx on public.checklists (task_id);
create trigger checklists_set_updated_at before update on public.checklists
  for each row execute function public.set_updated_at();

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  content text not null,
  is_done boolean not null default false,
  position integer not null default 0,
  done_by uuid references public.profiles(id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checklist_items_list_idx on public.checklist_items (checklist_id, position);
create trigger checklist_items_set_updated_at before update on public.checklist_items
  for each row execute function public.set_updated_at();

-- --- notifications -----------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text,
  entity_type text not null,
  entity_id uuid,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx
  on public.notifications (recipient_id, is_read, created_at desc);

-- =============================================================================
-- Helper: checklist access via its task's project
-- =============================================================================
create or replace function public.task_id_project(p_task_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from public.tasks where id = p_task_id;
$$;

create or replace function public.checklist_project_id(p_checklist_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select t.project_id
  from public.checklists c join public.tasks t on t.id = c.task_id
  where c.id = p_checklist_id;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.comments enable row level security;
alter table public.comment_mentions enable row level security;
alter table public.files enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_items enable row level security;
alter table public.notifications enable row level security;

-- comments: internal comments never visible to clients.
create policy comments_select on public.comments
  for select using (
    deleted_at is null
    and public.can_access_project(project_id)
    and (is_internal = false or public.can_see_internal(project_id))
  );
create policy comments_insert on public.comments
  for insert with check (
    public.can_access_project(project_id)
    and author_id = auth.uid()
    and (is_internal = false or public.can_see_internal(project_id))
  );
create policy comments_update on public.comments
  for update using (author_id = auth.uid() or public.can_manage_project(project_id))
  with check (author_id = auth.uid() or public.can_manage_project(project_id));

-- comment_mentions: readable when the comment is readable.
create policy comment_mentions_select on public.comment_mentions
  for select using (
    exists (select 1 from public.comments c where c.id = comment_id)
  );
create policy comment_mentions_insert on public.comment_mentions
  for insert with check (
    exists (select 1 from public.comments c
            where c.id = comment_id and c.author_id = auth.uid())
  );

-- files: internal files never visible to clients.
create policy files_select on public.files
  for select using (
    deleted_at is null
    and public.can_access_project(project_id)
    and (is_internal = false or public.can_see_internal(project_id))
  );
create policy files_insert on public.files
  for insert with check (
    public.can_access_project(project_id)
    and uploaded_by = auth.uid()
    and (is_internal = false or public.can_see_internal(project_id))
  );
create policy files_update on public.files
  for update using (uploaded_by = auth.uid() or public.can_manage_project(project_id))
  with check (uploaded_by = auth.uid() or public.can_manage_project(project_id));

-- checklists + items: agency-internal (require can_see_internal).
create policy checklists_select on public.checklists
  for select using (public.can_see_internal(task_id_project(task_id)));
create policy checklists_write on public.checklists
  for all using (public.can_see_internal(task_id_project(task_id)))
  with check (public.can_see_internal(task_id_project(task_id)));
create policy checklist_items_select on public.checklist_items
  for select using (public.can_see_internal(public.checklist_project_id(checklist_id)));
create policy checklist_items_write on public.checklist_items
  for all using (public.can_see_internal(public.checklist_project_id(checklist_id)))
  with check (public.can_see_internal(public.checklist_project_id(checklist_id)));

-- notifications: recipients manage their own; creation happens via the
-- service client (server-side) after authorization.
create policy notifications_select on public.notifications
  for select using (recipient_id = auth.uid());
create policy notifications_update on public.notifications
  for update using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
create policy notifications_delete on public.notifications
  for delete using (recipient_id = auth.uid());

-- =============================================================================
-- Storage: private bucket + org-scoped policies (defence in depth).
-- Downloads are served via short-lived signed URLs created server-side after
-- the files-table RLS check; these policies additionally scope direct access.
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;

-- Path convention: org/{organization_id}/project/{project_id}/...
create policy "files bucket read own org"
  on storage.objects for select
  using (
    bucket_id = 'files'
    and (storage.foldername(name))[1] = 'org'
    and ((storage.foldername(name))[2])::uuid in (select public.current_user_org_ids())
  );
create policy "files bucket insert own org"
  on storage.objects for insert
  with check (
    bucket_id = 'files'
    and (storage.foldername(name))[1] = 'org'
    and ((storage.foldername(name))[2])::uuid in (select public.current_user_org_ids())
  );
