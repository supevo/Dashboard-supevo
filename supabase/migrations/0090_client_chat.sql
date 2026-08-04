-- =============================================================================
-- Migration 0090 – Kunden-Chat (Kunde ↔ Ansprechpartner) über die Kanäle
--
-- Ein Chat-Kanal je Kundenfirma (kind = 'client', client_company_id gesetzt).
-- Agentur-Mitarbeiter sehen ihn wie gewohnt; zusätzlich dürfen die Kontakte der
-- Kundenfirma genau diesen einen Kanal lesen und schreiben. Interne Kanäle
-- (kind 'channel'/'dm') bleiben unberührt.
--
-- Umgesetzt durch Erweiterung der zentralen Zugriffsfunktion
-- can_access_chat_channel: eine zusätzliche ODER-Bedingung für Kunden-Kontakte
-- eines Kunden-Kanals. So gilt der Zugriff einheitlich für Lesen und Schreiben,
-- ohne die bestehenden Policies anzufassen.
-- =============================================================================

alter table public.chat_channels
  add column if not exists client_company_id uuid
    references public.client_companies(id) on delete cascade;
create index if not exists chat_channels_client_idx
  on public.chat_channels (client_company_id)
  where client_company_id is not null;

create or replace function public.can_access_chat_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_channels c
    where c.id = p_channel_id
      and (
        -- Agency staff of the org (private channels/DMs only for members).
        (
          public.is_agency_staff()
          and c.organization_id in (select public.current_user_org_ids())
          and (
            c.is_private = false
            or exists (
              select 1 from public.chat_channel_members m
              where m.channel_id = c.id and m.user_id = auth.uid()
            )
          )
        )
        -- Client contacts of a client channel (Kunde ↔ Ansprechpartner).
        or (
          c.kind = 'client'
          and exists (
            select 1 from public.client_contacts cc
            where cc.client_company_id = c.client_company_id
              and cc.user_id = auth.uid()
          )
        )
      )
  );
$$;
