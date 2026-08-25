-- Mehrere Add-on-Module je Modul: statt eines einzelnen addon_module_key kann ein
-- Modul nun mehrere Add-on-Module referenzieren. Sind sie Pflicht (addon_required),
-- werden beim Aktivieren des Moduls alle automatisch mit aktiviert.
set lock_timeout = '5s';

alter table public.membership_modules
  add column if not exists addon_module_keys text[] not null default '{}';

-- Bestehenden Einzel-Key übernehmen (Rückwärtskompatibilität).
update public.membership_modules
  set addon_module_keys = array[addon_module_key]
  where addon_module_key is not null
    and addon_module_key <> ''
    and (addon_module_keys is null or addon_module_keys = '{}');
