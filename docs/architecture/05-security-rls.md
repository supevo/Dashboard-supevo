# Sicherheitskonzept: RLS, Uploads, Audit, DSGVO

## 1. Verteidigung in der Tiefe (Defense in Depth)

Berechtigungen werden an **zwei** Stellen erzwungen:

1. **Datenbank (RLS)** – harte, nicht umgehbare Grenze. Selbst bei einem Fehler
   in der Anwendung kann kein Mandant fremde/interne Daten lesen.
2. **Anwendung (Server Actions / Route Handler)** – zentrales Policy-Modul
   prüft Berechtigungen vor jeder schreibenden Aktion, liefert verständliche
   deutsche Fehlermeldungen und protokolliert.

Das Frontend prüft ausschließlich zur UI-Steuerung (Buttons aus-/einblenden)
und ist **niemals** Sicherheitsgrenze.

## 2. RLS-Hilfsfunktionen (`SECURITY DEFINER`)

Zentrale Funktionen kapseln die Zugriffslogik und werden in Policies wieder-
verwendet. Sie laufen als `SECURITY DEFINER` mit fixiertem `search_path` und
sind `STABLE`.

```sql
-- Systemweiter Betreiberzugriff
create function is_super_admin() returns boolean ...
  -- true, wenn aktiver Membership-Eintrag mit role = 'super_admin'

-- Gehört der aktuelle Nutzer zur Agentur (interne Rolle)?
create function is_agency_staff() returns boolean ...
  -- true bei agency_admin | project_manager | employee | freelancer

-- Organisationen des aktuellen Nutzers (aktive Memberships)
create function current_user_org_ids() returns setof uuid ...

-- Darf der Nutzer das Projekt überhaupt sehen?
create function can_access_project(p_project_id uuid) returns boolean ...
  -- super_admin: true
  -- agency_admin: true, wenn Projekt zur Agentur-Betreuung gehört
  -- project_manager/employee/freelancer: Eintrag in project_members
  -- client: project.organization_id in current_user_org_ids() UND Eintrag in project_members
  -- guest: nur über explizite Objektfreigabe (separate Prüfung)

-- Darf der Nutzer INTERNE Daten des Projekts sehen?
create function can_see_internal(p_project_id uuid) returns boolean ...
  -- true nur für Agenturrollen/super_admin mit Projektzugriff
  -- immer false für client/guest
```

> Wichtig: RLS-Policies referenzieren `auth.uid()` (die Supabase-User-ID).
> Der Service-Client umgeht RLS und wird nur serverseitig eingesetzt.

## 3. Policy-Muster je Tabelle

Beispielhaft für `task_comments` (analog für files, notes, time_entries):

```sql
alter table task_comments enable row level security;

-- SELECT: Zugriff auf Projekt UND (nicht intern ODER darf intern sehen)
create policy task_comments_select on task_comments
for select using (
  can_access_project((select project_id from tasks where tasks.id = task_comments.task_id))
  and (
    is_internal = false
    or can_see_internal((select project_id from tasks where tasks.id = task_comments.task_id))
  )
  and deleted_at is null
);

-- INSERT: nur mit Projektzugriff; interne Kommentare nur durch Agenturrollen
create policy task_comments_insert on task_comments
for insert with check (
  can_access_project((select project_id from tasks where tasks.id = task_comments.task_id))
  and (is_internal = false or can_see_internal(...))
  and author_id = auth.uid()
);

-- UPDATE/DELETE: nur Autor oder project_manager/agency_admin des Projekts
```

**Kernaussage**: Die Kombination `is_internal = false OR can_see_internal(...)`
ist die technische Umsetzung von Anforderung 4 – Kunden sehen interne Daten
niemals.

## 4. Aktivitätsprotokoll (append-only)

```sql
alter table activity_log enable row level security;

-- INSERT für authentifizierte Nutzer erlaubt (actor_id = auth.uid())
create policy activity_log_insert on activity_log
for insert with check (actor_id = auth.uid() or is_super_admin());

-- KEIN update/delete-Policy -> per Default verboten (Manipulationsschutz)

-- SELECT: agency_admin (eigene Agentur) / super_admin
create policy activity_log_select on activity_log
for select using (is_super_admin() or (is_agency_staff() and ...));
```

Systemseitige Einträge (z. B. Login-Events) werden über den Service-Client
geschrieben. Protokolliert werden mindestens: create/update/delete relevanter
Entitäten, Rollenänderungen, Freigabeentscheidungen, Uploads/Downloads,
Login/Logout, Einladungen.

## 5. Sichere Datei-Uploads

Regeln (serverseitig, nicht verhandelbar):

1. **Kein öffentlicher Bucket.** Downloads ausschließlich über kurzlebige
   Signed URLs, die serverseitig nach Berechtigungsprüfung erzeugt werden.
2. **Speicherpfad wird serverseitig erzeugt** – nie vom Client übernommen.
   Konvention:
   `org/{organization_id}/project/{project_id}/{yyyy}/{mm}/{uuid}_{sanitized_name}`
3. **MIME-Typ-Allowlist** je Kontext (z. B. Bilder, PDF, Office, ZIP). Prüfung
   nicht nur anhand der Dateiendung, sondern über den tatsächlichen Inhalt
   (Magic Bytes) serverseitig.
4. **Größenlimit** je Typ/Kontext (z. B. 25 MB Standard, konfigurierbar) –
   serverseitig **und** über Storage-Policy erzwungen.
5. **Berechtigung** vor jedem Upload/Download über das Policy-Modul geprüft.
6. **Dateiname wird bereinigt** (Path-Traversal-, Sonderzeichen-Schutz); der
   Originalname wird nur als Anzeigefeld gespeichert.
7. **Checksumme (SHA-256)** zur Integritätsprüfung und Deduplizierung.
8. **is_internal** entscheidet über Kundensichtbarkeit; interne Dateien sind
   für `client`/`guest` per RLS + Storage-Policy nicht abrufbar.
9. **Virenscan** (z. B. ClamAV via Edge Function/Job) als Ausbaustufe
   dokumentiert (technische Schuld, wenn zunächst nicht umgesetzt).

Storage-RLS-Policies auf `storage.objects` prüfen den Pfadpräfix gegen
`current_user_org_ids()` und die Projektzugehörigkeit.

## 6. Weitere Sicherheitsrisiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|--------|---------------|
| Mandantenübergreifender Datenabfluss | RLS auf **jeder** Tabelle + automatisierte RLS-Tests je Rolle. |
| Interne Daten an Kunden | `is_internal`/`is_client_visible` in RLS erzwungen; Default = intern. |
| Rechteausweitung (Role Escalation) | Rollenänderung nur durch erlaubte Rollen, serverseitig geprüft, auditiert; `agency_admin` darf kein `super_admin` vergeben. |
| IDOR / direkte Objektzugriffe | Ausschließlich User-Client (RLS); Service-Key nie im Client. |
| Mass Assignment | Zod-Schemata mit expliziter Feld-Allowlist an jeder Servergrenze. |
| Service-Role-Key-Leak | Nur in Server-Env; separate `env`-Trennung; nie in `NEXT_PUBLIC_*`. |
| Audit-Manipulation | `activity_log` append-only (kein UPDATE/DELETE-Policy). |
| Einladungs-Token-Diebstahl | Nur Token-**Hash** gespeichert, Ablaufzeit, Einmalgebrauch. |
| Session-Hijacking | Supabase Auth (kurzlebige JWT + Refresh), HttpOnly-Cookies. |
| Unsichere Fehlermeldungen | Interne Details nur ins Log; Nutzer erhalten generische, deutsche Meldungen. |

## 7. DSGVO / Datenschutz

- **EU-Datenhaltung** (Supabase EU / Self-Hosting DE).
- **Auskunft & Löschung**: Export- und Lösch-Workflows je betroffener Person
  (Recht auf Auskunft/Vergessenwerden) – als eigene Phase eingeplant.
- **Auftragsverarbeitung**: AV-Vertrag mit Hosting-Anbieter.
- **Aufbewahrungsfristen**: Aktivitätsprotokoll und Zeiteinträge mit
  definierter Aufbewahrung; Soft-Delete + spätere harte Löschung.
- **Datensparsamkeit**: nur notwendige personenbezogene Daten.

## 8. Verständliche Fehlermeldungen

Zentrale Fehlerklassen (`AuthorizationError`, `ValidationError`,
`NotFoundError`) werden an der Servergrenze in **deutsche**, nutzerfreundliche
Meldungen übersetzt. Technische Details (Stacktrace, IDs) landen nur im
serverseitigen Log/Audit, nie in der Antwort an den Client.
