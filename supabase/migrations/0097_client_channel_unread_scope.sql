-- =============================================================================
-- Migration 0097 – Ungelesen-Zähler für Kunden-Kanäle einschränken
--
-- Kunden-Chat-Kanäle (kind = 'client') sind für das ganze Agentur-Team sichtbar.
-- Bisher zählte chat_unread_counts() ihre Nachrichten aber für JEDEN Mitarbeiter
-- als ungelesen – dadurch bekam auch, wer nicht Ansprechpartner ist, eine rote
-- Benachrichtigung. Ab jetzt zählen Kunden-Kanäle nur noch für den Haupt- bzw.
-- stellvertretenden Ansprechpartner des Kunden (und für die Kunden-Kontakte
-- selbst). Interne Kanäle/DMs bleiben unverändert.
--
-- Voraussetzung: Migration 0094 (secondary_account_manager_id) ist eingespielt.
-- =============================================================================

create or replace function public.chat_unread_counts()
returns table(channel_id uuid, unread bigint)
language sql
stable
security invoker
as $$
  select m.channel_id, count(*)::bigint
  from public.chat_channel_messages m
  join public.chat_channels c on c.id = m.channel_id
  left join public.chat_reads r
    on r.channel_id = m.channel_id and r.user_id = auth.uid()
  where m.author_id is distinct from auth.uid()
    and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
    and (
      -- Interne Kanäle/DMs: unverändert für alle Zugriffsberechtigten.
      c.kind <> 'client'
      -- Kunden-Kanäle: nur für die zuständigen Ansprechpartner …
      or exists (
        select 1 from public.client_companies cc
        where cc.id = c.client_company_id
          and (
            cc.account_manager_id = auth.uid()
            or cc.secondary_account_manager_id = auth.uid()
          )
      )
      -- … oder für die Kunden-Kontakte selbst (Portalseite).
      or exists (
        select 1 from public.client_contacts ct
        where ct.client_company_id = c.client_company_id
          and ct.user_id = auth.uid()
      )
    )
  group by m.channel_id;
$$;
