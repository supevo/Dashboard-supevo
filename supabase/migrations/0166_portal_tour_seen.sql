-- =============================================================================
-- Migration 0166 – Portal-Tour "gesehen"-Marker je Ansprechpartner
--
-- Beim ersten Login eines Kunden-Ansprechpartners läuft eine geführte Tour über
-- die Übersicht. Wir merken pro Kontakt, wann die Tour gesehen/beendet wurde,
-- damit sie nicht bei jedem Login erneut automatisch startet. Der Kunde kann sie
-- jederzeit manuell erneut ansehen.
-- =============================================================================

alter table public.client_contacts
  add column if not exists portal_tour_seen_at timestamptz;

-- Der Kunde darf seinen eigenen Kontakt-Datensatz aktualisieren (u. a. diesen
-- Marker). Falls noch keine solche UPDATE-Policy existiert, hier anlegen.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'client_contacts'
      and policyname = 'client_contacts_self_update'
  ) then
    create policy client_contacts_self_update on public.client_contacts
      for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

notify pgrst, 'reload schema';
