-- =============================================================================
-- Diagnose: Wer ist wer? (im Supabase SQL Editor ausführen)
--
-- Zeigt alle Auth-Benutzer mit ihren Mitgliedschaften und Rollen. Damit siehst
-- du sofort, ob die E-Mail, mit der du dich in der App einloggst, wirklich eine
-- aktive Mitgliedschaft mit einer Admin-Rolle (super_admin / agency_admin) in
-- der Agentur-Organisation hat.
--
-- Wenn deine Login-E-Mail hier KEINE Zeile mit role = super_admin (oder
-- agency_admin) und status = active zeigt, ist genau das die Ursache für den
-- RLS-Fehler beim Anlegen. -> repair-admin.sql ausführen.
-- =============================================================================

select
  u.email                              as login_email,
  u.id                                 as user_id,
  u.email_confirmed_at is not null     as email_bestaetigt,
  coalesce(m.role::text, '— keine Mitgliedschaft —') as rolle,
  m.status                             as status,
  o.name                               as organisation,
  o.type                               as org_typ,
  o.id                                 as organisation_id
from auth.users u
left join public.memberships m on m.user_id = u.id
left join public.organizations o on o.id = m.organization_id
order by u.created_at, o.name;

-- Zusätzlich: Gibt es überhaupt eine Agentur-Organisation?
select id, name, slug, type from public.organizations where type = 'agency';
