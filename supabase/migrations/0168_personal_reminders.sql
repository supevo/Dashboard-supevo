-- =============================================================================
-- Migration 0168 – Persönliche Erinnerungen / To-dos
--
-- Der KI-Assistent (und ein Dashboard-Widget) können persönliche Erinnerungen und
-- To-dos je Nutzer anlegen ("Erinnere mich morgen daran, …"). Ein täglicher Cron
-- macht aus fälligen Erinnerungen eine Benachrichtigung.
-- =============================================================================

create table if not exists public.personal_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  text text not null,
  due_at timestamptz,          -- null = reines To-do ohne Termin
  done_at timestamptz,
  notified_at timestamptz,     -- gesetzt, wenn der Cron die Fälligkeits-Benachrichtigung erstellt hat
  created_at timestamptz not null default now()
);

create index if not exists personal_reminders_user_idx
  on public.personal_reminders (user_id, done_at, due_at);

alter table public.personal_reminders enable row level security;

-- Jede Person verwaltet ausschließlich ihre eigenen Erinnerungen.
create policy personal_reminders_select on public.personal_reminders
  for select using (user_id = auth.uid());
create policy personal_reminders_insert on public.personal_reminders
  for insert with check (user_id = auth.uid());
create policy personal_reminders_update on public.personal_reminders
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy personal_reminders_delete on public.personal_reminders
  for delete using (user_id = auth.uid());

-- Benachrichtigungstyp für fällige Erinnerungen.
alter type public.notification_type add value if not exists 'reminder';

notify pgrst, 'reload schema';
