-- =============================================================================
-- Migration 0086 – Kunden-Reaktionen auf gelieferte Ergebnisse
--
-- Der Kunde kann eine erledigte (client-sichtbare) Aufgabe mit einem Emoji
-- würdigen (👍 ❤️ 🎉 🙌 🔥). Eine Reaktion pro Person und Aufgabe – erneutes
-- Tippen wechselt/entfernt das Emoji. Die zuständigen Mitarbeiter werden über
-- die Reaktion benachrichtigt (dopaminstarker „der Kunde freut sich"-Moment).
--
-- Schreibzugriff läuft über den Service-Client nach In-Code-Autorisierung
-- (Aufrufer muss die Aufgabe sehen können) – daher nur eine SELECT-Policy.
-- =============================================================================

create table if not exists public.task_reactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (task_id, user_id)
);
create index if not exists task_reactions_task_idx on public.task_reactions (task_id);

alter table public.task_reactions enable row level security;

-- Read: anyone who can access the task's project (agency staff or the client's
-- contacts). Mirrors can_access_project so both sides see the reactions.
create policy task_reactions_select on public.task_reactions
  for select using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and public.can_access_project(t.project_id)
    )
  );

-- Notification type for the "client reacted" signal. NOTE: an enum value cannot
-- be added and used in the same transaction — run this line on its own if your
-- migration runner wraps files in a transaction.
alter type public.notification_type add value if not exists 'reaction';
