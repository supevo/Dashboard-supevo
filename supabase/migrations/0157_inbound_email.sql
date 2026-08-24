-- Teil C: E-Mail-Eingang für Anfragen (IMAP-Abruf + KI-Spam/Parsing).
-- Spam-Markierung an web_inquiries; Quarantäne für nicht/mehrdeutig zuordenbare
-- Mails (fail-closed – nie raten).
set lock_timeout = '5s';

-- Spam-Kennzeichnung an bestehenden Anfragen.
alter table public.web_inquiries
  add column if not exists is_spam boolean not null default false;
alter table public.web_inquiries
  add column if not exists spam_reason text;

-- Quarantäne: Mails ohne eindeutigen, aktiven Token. organization_id kann NULL
-- sein (bei unbekanntem Token wissen wir die Org nicht).
create table if not exists public.inbound_quarantine (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  reason text not null,
  from_address text,
  to_addresses text[] not null default '{}',
  subject text,
  body text,
  message_id text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists inbound_quarantine_unresolved_idx
  on public.inbound_quarantine (resolved, created_at desc);
create unique index if not exists inbound_quarantine_msgid_idx
  on public.inbound_quarantine (message_id) where message_id is not null;

-- Zugriff nur über den Service-Client in autorisiertem Server-Code.
alter table public.inbound_quarantine enable row level security;
