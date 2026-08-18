-- =============================================================================
-- 0140 – Gelöschte Mitarbeiter auch aus dem Teamchat entfernen
--
-- purge_org_member entfernte bisher Mitgliedschaft + Zeitdaten, ließ den Nutzer
-- aber in chat_channel_members (Teamchat/DMs) stehen. Dadurch blieb er im Chat
-- „hinterlegt". Jetzt wird die Chat-Mitgliedschaft dieser Org mitgelöscht.
--
-- Zusätzlich ein einmaliges Aufräumen bereits verwaister Chat-Mitgliedschaften:
-- Nutzer, die in ihrer Org KEINE Mitgliedschaft mehr haben (also gelöscht
-- wurden), werden aus chat_channel_members entfernt. Deaktivierte (suspended)
-- Mitarbeiter behalten ihre Mitgliedschaftszeile und bleiben unberührt.
-- =============================================================================

create or replace function public.purge_org_member(p_user uuid, p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.time_entries where user_id = p_user and organization_id = p_org;
  delete from public.work_sessions where user_id = p_user and organization_id = p_org;
  delete from public.chat_channel_members where user_id = p_user and organization_id = p_org;
  delete from public.memberships where user_id = p_user and organization_id = p_org;
end;
$$;

-- Einmaliges Aufräumen für bereits gelöschte Mitarbeiter.
delete from public.chat_channel_members ccm
 where not exists (
   select 1
     from public.memberships m
    where m.user_id = ccm.user_id
      and m.organization_id = ccm.organization_id
 );
