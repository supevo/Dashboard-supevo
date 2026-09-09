-- Fix: Super-Admins konnten keine Chat-Kanäle anlegen.
--
-- Die chat_channels-Policies für SELECT/UPDATE/DELETE erlauben alle zusätzlich
-- `or public.is_super_admin()`, die INSERT-Policy aber NICHT. Ein systemweiter
-- Super-Admin, der in der jeweiligen Organisation kein regulärer Mitglied ist,
-- fällt dadurch über die Bedingung
--   organization_id in (select public.current_user_org_ids())
-- und der Insert wird abgelehnt. Wir gleichen die INSERT-Policy an die übrigen an.

drop policy if exists chat_channels_insert on public.chat_channels;

create policy chat_channels_insert on public.chat_channels
  for insert with check (
    (public.is_agency_staff() and organization_id in (select public.current_user_org_ids()))
    or public.is_super_admin()
  );
