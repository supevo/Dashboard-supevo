-- =============================================================================
-- Migration 0200 – DM-Zugriff robust über die Teilnahme (dm_key)
--
-- Bisher hing der Lesezugriff auf einen Direktnachrichten-Kanal (kind='dm',
-- is_private=true) ausschließlich an einer Zeile in chat_channel_members. Fällt
-- diese Zeile weg – z. B. durch den Einmal-Sweep aus 0140 oder purge_org_member,
-- die chat_channel_members löschen, sobald (user_id, organization_id) keine
-- passende Mitgliedschaft hat, während DM-Zeilen die Org des ERSTELLERS tragen –,
-- versteckt RLS den kompletten DM (keine Nachrichten, kein Eintrag in der Liste),
-- ohne Fehler. Das brach zuletzt DMs, während öffentliche Kanäle weiterliefen.
--
-- Fix: Ein DM ist zusätzlich für genau seine beiden Teilnehmer lesbar – kodiert
-- im dm_key ("<uidA>:<uidB>", sortiert, serverseitig aus den User-IDs gesetzt).
-- Weiterhin auf Agentur-Mitarbeiter derselben Org begrenzt; NICHT-Teilnehmer
-- bekommen dadurch keinen Zugriff. Reine Absicherung, ändert keine Policies.
-- =============================================================================

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
        -- DMs: zusätzlich für die beiden im dm_key kodierten Teilnehmer,
        -- unabhängig von einer (evtl. verlorenen) chat_channel_members-Zeile.
        or (
          c.kind = 'dm'
          and c.dm_key is not null
          and public.is_agency_staff()
          and c.organization_id in (select public.current_user_org_ids())
          and auth.uid()::text in (
            split_part(c.dm_key, ':', 1),
            split_part(c.dm_key, ':', 2)
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

-- PostgREST-Schemacache nach der Funktionsänderung neu laden.
notify pgrst, 'reload schema';
