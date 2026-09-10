-- =============================================================================
-- Migration 0196 – Chat: Emoji-Reaktion auf eine Nachricht (WhatsApp-Stil)
--
-- Jede Person kann eine Nachricht mit EINEM Emoji würdigen (👍 ❤️ 😂 …). Erneutes
-- Tippen desselben Emojis entfernt die Reaktion, ein anderes Emoji ersetzt sie –
-- daher genau eine Reaktion pro (Nachricht, Person): unique (message_id, user_id).
--
-- Schreibzugriff läuft über den Service-Client nach In-Code-Autorisierung (der
-- Aufrufer muss die Nachricht/den Kanal sehen können) – daher nur SELECT-Policy.
-- =============================================================================

create table if not exists public.chat_message_reactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  message_id uuid not null references public.chat_channel_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id)
);

create index if not exists chat_message_reactions_message_idx
  on public.chat_message_reactions (message_id);

alter table public.chat_message_reactions enable row level security;

-- Read: agency staff of the organization (wie bei chat_poll_votes). Der Service-
-- Client in mapMessages liest ohnehin kanalbezogen, diese Policy deckt den
-- RLS-Client-Fall ab.
drop policy if exists chat_message_reactions_select on public.chat_message_reactions;
create policy chat_message_reactions_select on public.chat_message_reactions
  for select using (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
