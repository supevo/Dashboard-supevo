# Datenmodell

Alle Bezeichner **Englisch**. PostgreSQL/Supabase. Zeitpunkte technisch in
**UTC** (`timestamptz`), Anzeige in `Europe/Berlin`. PK: `uuid`
(`gen_random_uuid()`). Zeitstempel `created_at`/`updated_at` auf allen Tabellen.

## Grundkonventionen

- **Mandantentrennung**: Jede fachliche Tabelle trägt `organization_id`
  (denormalisiert, auch wenn über FKs ableitbar) → einfache, schnelle RLS.
- **Kundentrennung**: Kundenbezogene Tabellen tragen zusätzlich
  `client_company_id` bzw. leiten sie über `project_id` ab.
- **Sichtbarkeit**: `is_internal boolean NOT NULL DEFAULT true` auf allen
  Entitäten mit Agentur/Kunde-Grenze. Default = intern (sicher per Default).
- **Soft-Delete**: `deleted_at timestamptz NULL` bei fachlich relevanten
  Entitäten; RLS blendet gelöschte Zeilen aus.
- **Optimistische Sperre**: `lock_version integer NOT NULL DEFAULT 0` auf
  gleichzeitig editierbaren Entitäten (tasks) → Schutz vor Lost Updates.
- **Löschverhalten (FK)**: `ON DELETE CASCADE` für abhängige Kinddaten
  (z. B. checklist_items an checklist), `ON DELETE RESTRICT` für referenzielle
  Stammdaten (z. B. Label an Organisation), `ON DELETE SET NULL` für optionale
  Referenzen (z. B. assignee an gelöschtem Nutzer). Details je Tabelle.

## Enum-Typen

```sql
create type organization_type   as enum ('agency', 'client');
create type app_role            as enum ('super_admin','agency_admin','project_manager','employee','freelancer','client','guest');
create type membership_status    as enum ('invited','active','suspended');
create type project_status       as enum ('planned','active','on_hold','completed','archived');
create type project_member_role  as enum ('lead','contributor','viewer','client');
create type task_priority        as enum ('low','medium','high','urgent');
create type column_key           as enum ('queue','active','review','done','custom');
create type approval_status      as enum ('pending','approved','rejected','changes_requested');
create type time_source          as enum ('manual','timer');
create type work_session_status  as enum ('active','on_break','closed');
create type notification_type    as enum (
  'task_assigned','comment_mention','client_comment','internal_question',
  'task_in_review','task_for_approval','approval_granted','changes_requested',
  'due_date_reached','task_overdue','file_uploaded');
create type activity_action      as enum (
  'create','update','delete','status_change','assignee_change','due_date_change',
  'role_change','login','logout','file_upload','file_download','comment',
  'approval_request','approval_decision','invite','archive','time_edit');
```

---

## 1. organizations
**Zweck:** Mandant (Agentur). Mehrere möglich (White-Label-fähig).

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| name | text | ✔ | |
| type | organization_type | ✔ | i. d. R. `agency` |
| slug | text | ✔ | für URLs |
| settings | jsonb | ✔ | DEFAULT `{}` – u. a. Upload-Policy (erlaubte MIME, max. Größe), Zeitzone |
| created_at/updated_at | timestamptz | ✔ | |

**Unique:** `slug`. **Indizes:** `slug`. **Löschen:** i. d. R. nicht; harte
Löschung nur durch super_admin (kaskadiert bewusst nicht automatisch).

## 2. profiles
**Zweck:** Erweiterung von `auth.users` (1:1). Keine Rolle hier.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | = `auth.users.id` |
| full_name | text | | |
| avatar_url | text | | |
| locale | text | ✔ | DEFAULT `'de'` |
| created_at/updated_at | timestamptz | ✔ | |

**Löschen:** FK zu `auth.users` `ON DELETE CASCADE`.

## 3. memberships
**Zweck:** User ↔ Organization + globale Rolle. Zentrale Autorisierungstabelle.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| user_id | uuid → profiles.id | ✔ | |
| organization_id | uuid → organizations.id | ✔ | |
| role | app_role | ✔ | |
| status | membership_status | ✔ | DEFAULT `'invited'` |
| created_at/updated_at | timestamptz | ✔ | |

**Unique:** `(user_id, organization_id)` – ein Nutzer hat pro Org **eine** Rolle.
**Indizes:** `user_id`, `(organization_id, role)`. **Löschen:** `ON DELETE
CASCADE` von beiden Seiten. `super_admin` wird nie über die UI vergeben (nur per
Migration/DB, siehe Sicherheitskonzept).

## 4. client_companies
**Zweck:** Kundenunternehmen innerhalb einer Organisation.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid → organizations.id | ✔ | |
| name | text | ✔ | |
| contact_email | text | | |
| notes | text | | intern |
| is_active | boolean | ✔ | DEFAULT `true` |
| created_at/updated_at/deleted_at | timestamptz | | Soft-Delete |

**Unique:** `(organization_id, name)`. **Indizes:** `organization_id`.
**Löschen:** Soft-Delete; harte Löschung `ON DELETE RESTRICT`, solange Projekte
existieren.

## 5. client_contacts
**Zweck:** Ordnet Kundennutzer (Rolle `client`/`guest`) einem Kundenunternehmen zu.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid → organizations.id | ✔ | |
| client_company_id | uuid → client_companies.id | ✔ | |
| user_id | uuid → profiles.id | ✔ | |
| is_primary | boolean | ✔ | DEFAULT `false` – Hauptansprechpartner |
| created_at | timestamptz | ✔ | |

**Unique:** `(client_company_id, user_id)`. **Indizes:** `user_id`,
`client_company_id`. **Löschen:** `ON DELETE CASCADE`.

## 6. projects
**Zweck:** Projekt einer Kundenorganisation, betreut von der Agentur.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid → organizations.id | ✔ | Mandant |
| client_company_id | uuid → client_companies.id | ✔ | Kunde |
| name | text | ✔ | |
| description | text | | |
| status | project_status | ✔ | DEFAULT `'planned'` |
| lead_user_id | uuid → profiles.id | | Projektleiter, `ON DELETE SET NULL` |
| is_client_visible | boolean | ✔ | DEFAULT `false` – erst freigeben |
| start_date/due_date | date | | |
| created_by | uuid → profiles.id | ✔ | |
| created_at/updated_at/deleted_at | timestamptz | | Soft-Delete |

**Indizes:** `organization_id`, `client_company_id`, `(organization_id,status)`.
**Löschen:** Soft-Delete; Kinddaten (boards, tasks) folgen.

## 7. project_members
**Zweck:** User ↔ Project + Projektrolle. Steuert Projektsichtbarkeit.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| project_id | uuid → projects.id | ✔ | |
| user_id | uuid → profiles.id | ✔ | |
| role | project_member_role | ✔ | |
| created_at | timestamptz | ✔ | |

**Unique:** `(project_id, user_id)`. **Indizes:** `user_id`, `project_id`.
**Löschen:** `ON DELETE CASCADE`.

## 8. boards
**Zweck:** Kanban-Board eines Projekts. Mindestens eines pro Projekt.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid | ✔ | |
| project_id | uuid → projects.id | ✔ | |
| name | text | ✔ | DEFAULT `'Board'` |
| position | integer | ✔ | |
| created_at/updated_at | timestamptz | ✔ | |

**Indizes:** `project_id`. **Löschen:** `ON DELETE CASCADE` von project.

## 9. board_columns
**Zweck:** Spalte eines Boards inkl. WIP-Limits. Standard: Warteschlange,
Aktive Aufgabe, In Überprüfung, Fertig.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid | ✔ | |
| board_id | uuid → boards.id | ✔ | |
| name | text | ✔ | umbenennbar |
| column_key | column_key | ✔ | `queue`/`active`/`review`/`done`/`custom` |
| position | integer | ✔ | Reihenfolge änderbar |
| wip_limit | integer | | Gesamtlimit (z. B. review = 5) |
| wip_limit_per_user | integer | | z. B. active = 1 pro Mitarbeiter |
| is_done_column | boolean | ✔ | DEFAULT `false` |
| created_at/updated_at | timestamptz | ✔ | |

**Unique:** `(board_id, position)` (deferrable) und `(board_id, column_key)` für
Standard-Keys ≠ custom. **Indizes:** `board_id`. **Löschen:** `ON DELETE
CASCADE`; Verschieben von Tasks vor Spaltenlöschung erzwingen (Server Action).

## 10. tasks
**Zweck:** Aufgabe/Unteraufgabe.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid | ✔ | |
| project_id | uuid → projects.id | ✔ | |
| board_id | uuid → boards.id | ✔ | |
| column_id | uuid → board_columns.id | ✔ | aktuelle Spalte |
| parent_task_id | uuid → tasks.id | | Unteraufgabe, `ON DELETE CASCADE` |
| title | text | ✔ | |
| description | text | | Rich Text (sanitisiert gespeichert) |
| priority | task_priority | ✔ | DEFAULT `'medium'` |
| created_by | uuid → profiles.id | ✔ | |
| due_date | date | | |
| estimated_minutes | integer | | geschätzte Dauer |
| actual_minutes | integer | ✔ | DEFAULT 0, aus time_entries aggregiert |
| position | numeric | ✔ | Sortierung in Spalte (Lücken-Strategie) |
| is_internal | boolean | ✔ | DEFAULT `true` (intern/Kunde) |
| is_blocked | boolean | ✔ | DEFAULT `false` |
| is_archived | boolean | ✔ | DEFAULT `false` |
| lock_version | integer | ✔ | DEFAULT 0 – optimistische Sperre |
| created_at/updated_at/deleted_at | timestamptz | | Soft-Delete |

**Indizes:** `(column_id, position)`, `(project_id, is_internal)`,
`(organization_id, is_archived)`, `assignee`-Zugriff über task_assignees.
**Löschen:** Soft-Delete.
**Status:** wird über die Spalte (`column_key`) abgebildet, nicht redundant
gespeichert – „In Überprüfung"/„Fertig" ergeben sich aus der Spalte.

## 11. task_assignees
**Zweck:** Mehrere Verantwortliche je Aufgabe (n:m).

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| task_id | uuid → tasks.id | ✔ | PK-Teil |
| user_id | uuid → profiles.id | ✔ | PK-Teil |
| organization_id | uuid | ✔ | |
| assigned_at | timestamptz | ✔ | |

**PK/Unique:** `(task_id, user_id)`. **Indizes:** `user_id`. **Löschen:**
`ON DELETE CASCADE` (task), `ON DELETE CASCADE` (user).

## 12. labels
**Zweck:** Organisationsweite Labels.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid | ✔ | |
| name | text | ✔ | |
| color | text | ✔ | Hex; Kontrast-geprüft (a11y) |
| description | text | | |
| is_active | boolean | ✔ | DEFAULT `true` |
| is_client_visible | boolean | ✔ | DEFAULT `false` |
| created_by | uuid → profiles.id | ✔ | |
| created_at/updated_at | timestamptz | ✔ | |

**Unique:** `(organization_id, lower(name))` – eindeutig je Org. **Löschen:**
harte Löschung erlaubt, aber `task_labels` `ON DELETE CASCADE` – Aufgaben
bleiben erhalten. Deaktivierte Labels bleiben an bestehenden Tasks sichtbar,
sind aber nicht neu vergebbar (Server-Prüfung).

## 13. task_labels
**Zweck:** Aufgabe ↔ Label (n:m).

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| task_id | uuid → tasks.id | ✔ | PK-Teil |
| label_id | uuid → labels.id | ✔ | PK-Teil |
| organization_id | uuid | ✔ | |

**PK:** `(task_id, label_id)`. **Löschen:** `ON DELETE CASCADE` beidseitig.

## 14. comments
**Zweck:** Kommentare an Aufgaben (intern/extern).

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid | ✔ | |
| project_id | uuid → projects.id | ✔ | für RLS-Effizienz |
| task_id | uuid → tasks.id | ✔ | |
| author_id | uuid → profiles.id | ✔ | |
| body | text | ✔ | Rich Text, sanitisiert |
| is_internal | boolean | ✔ | DEFAULT `true` |
| edited_at | timestamptz | | |
| created_at/deleted_at | timestamptz | | Soft-Delete |

**Indizes:** `(task_id, created_at)`, `(project_id, is_internal)`. **Löschen:**
Soft-Delete; nur Autor oder PM/Admin (Server-Prüfung).

## 15. comment_mentions
**Zweck:** Erwähnungen für Benachrichtigungen.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| comment_id | uuid → comments.id | ✔ | PK-Teil |
| mentioned_user_id | uuid → profiles.id | ✔ | PK-Teil |
| organization_id | uuid | ✔ | |

**PK:** `(comment_id, mentioned_user_id)`. **Löschen:** `ON DELETE CASCADE`.
Erwähnbar sind nur Nutzer mit Zugriff auf die Aufgabe (Server-Prüfung); ein
Kunde kann nie einen internen Nutzer über einen externen Kommentar „aufdecken".

## 16. files
**Zweck:** Datei-Metadaten (Inhalt in Supabase Storage).

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid | ✔ | |
| project_id | uuid → projects.id | ✔ | |
| task_id | uuid → tasks.id | | optional |
| uploaded_by | uuid → profiles.id | ✔ | |
| storage_path | text | ✔ | serverseitig erzeugt; `org/../project/../task/..` |
| file_name | text | ✔ | Originalname (nur Anzeige) |
| mime_type | text | ✔ | serverseitig validiert (Magic Bytes) |
| size_bytes | bigint | ✔ | serverseitig validiert |
| checksum_sha256 | text | | Integrität/Dedup |
| is_internal | boolean | ✔ | DEFAULT `true` |
| created_at/deleted_at | timestamptz | | Soft-Delete |

**Unique:** `storage_path`. **Indizes:** `(task_id)`, `(project_id,is_internal)`.
**Löschen:** Soft-Delete + späterer Storage-Cleanup-Job. Kein öffentlicher
Bucket; Download nur über Signed URL nach Rechteprüfung.

## 17. checklists
**Zweck:** Mehrere Checklisten je Aufgabe.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid | ✔ | |
| task_id | uuid → tasks.id | ✔ | |
| title | text | ✔ | |
| position | integer | ✔ | |
| created_at/updated_at | timestamptz | ✔ | |

**Löschen:** `ON DELETE CASCADE` (task) → items folgen.

## 18. checklist_items
**Zweck:** Eintrag einer Checkliste.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid | ✔ | |
| checklist_id | uuid → checklists.id | ✔ | |
| content | text | ✔ | |
| is_done | boolean | ✔ | DEFAULT `false` |
| position | integer | ✔ | |
| done_by | uuid → profiles.id | | `ON DELETE SET NULL` |
| done_at | timestamptz | | |
| created_at/updated_at | timestamptz | ✔ | |

**Indizes:** `(checklist_id, position)`. **Löschen:** `ON DELETE CASCADE`.

## 19. time_entries
**Zweck:** Aufgaben-/Projektzeit.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid | ✔ | |
| client_company_id | uuid → client_companies.id | ✔ | für Auswertung nach Kunde |
| project_id | uuid → projects.id | ✔ | |
| task_id | uuid → tasks.id | | optional |
| user_id | uuid → profiles.id | ✔ | |
| started_at | timestamptz | ✔ | UTC |
| ended_at | timestamptz | | NULL = laufender Timer |
| duration_minutes | integer | | generiert bei Stopp; CHECK > 0 |
| description | text | | |
| is_billable | boolean | ✔ | DEFAULT `true` |
| is_client_visible | boolean | ✔ | DEFAULT `false` |
| source | time_source | ✔ | `manual`/`timer` |
| created_by | uuid → profiles.id | ✔ | |
| edit_reason | text | | Pflicht bei Fremdkorrektur |
| created_at/updated_at | timestamptz | ✔ | |

**Unique (partiell):** `unique (user_id) where ended_at is null and source =
'timer'` → **nur ein laufender Timer** je Nutzer. **Überlappungsschutz:**
Exclusion-Constraint über `tstzrange(started_at, ended_at)` je `user_id` (btree_gist),
verhindert unbemerkte Überschneidungen. **Indizes:** `(user_id, started_at)`,
`(project_id)`, `(client_company_id)`. **Löschen:** hart, aber protokolliert.

## 20. work_sessions
**Zweck:** Arbeitszeit (Ein-/Ausstempeln, Pausen).

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid | ✔ | |
| user_id | uuid → profiles.id | ✔ | |
| clock_in | timestamptz | ✔ | UTC |
| clock_out | timestamptz | | NULL = laufend |
| status | work_session_status | ✔ | `active`/`on_break`/`closed` |
| created_at/updated_at | timestamptz | ✔ | |

**Unique (partiell):** `unique (user_id) where clock_out is null` → **nur eine
laufende Sitzung**. **Indizes:** `(user_id, clock_in)`.

## 21. work_session_breaks
**Zweck:** Pausen innerhalb einer Arbeitszeitsitzung.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| work_session_id | uuid → work_sessions.id | ✔ | |
| organization_id | uuid | ✔ | |
| break_start | timestamptz | ✔ | |
| break_end | timestamptz | | NULL = laufende Pause |
| created_at | timestamptz | ✔ | |

**Unique (partiell):** `unique (work_session_id) where break_end is null`.
**Löschen:** `ON DELETE CASCADE`.

## 22. approvals
**Zweck:** Kundenfreigaben.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid | ✔ | |
| client_company_id | uuid → client_companies.id | ✔ | |
| project_id | uuid → projects.id | ✔ | |
| task_id | uuid → tasks.id | ✔ | freizugebende Aufgabe |
| title | text | ✔ | |
| status | approval_status | ✔ | DEFAULT `'pending'` |
| requested_by | uuid → profiles.id | ✔ | Agentur |
| decided_by | uuid → profiles.id | | Kunde/Gast |
| decision_comment | text | | Pflicht bei Ablehnung/Änderung |
| target_column_id | uuid → board_columns.id | | Auto-Move-Ziel (konfigurierbar) |
| decided_at | timestamptz | | |
| created_at/updated_at | timestamptz | ✔ | |

**Indizes:** `(project_id,status)`, `(client_company_id,status)`. **Löschen:**
`ON DELETE CASCADE` (task).

## 23. notifications
**Zweck:** In-App-Benachrichtigungen (E-Mail als spätere Ausbaustufe).

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid | ✔ | |
| recipient_id | uuid → profiles.id | ✔ | |
| type | notification_type | ✔ | |
| title | text | ✔ | deutsch |
| body | text | | |
| entity_type | text | ✔ | z. B. 'task','approval' |
| entity_id | uuid | | Deep-Link-Ziel |
| is_read | boolean | ✔ | DEFAULT `false` |
| read_at | timestamptz | | |
| created_at | timestamptz | ✔ | |

**Indizes:** `(recipient_id, is_read, created_at)`. **Dedup:** eindeutige
Kombination `(recipient_id, type, entity_id)` innerhalb kurzer Zeit
(Anwendungslogik) → keine doppelten Benachrichtigungen. **Löschen:** hart
(einzeln löschbar).

## 24. activity_log (append-only)
**Zweck:** Aktivitätsprotokoll. Nur INSERT (kein UPDATE/DELETE).

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid | | betroffener Mandant |
| actor_id | uuid → profiles.id | | handelnder Nutzer |
| action | activity_action | ✔ | |
| entity_type | text | ✔ | |
| entity_id | uuid | | |
| project_id | uuid | | für gefilterte Projektsicht |
| metadata | jsonb | ✔ | DEFAULT `{}` (Diff, IP, …) |
| created_at | timestamptz | ✔ | DEFAULT `now()` |

**Indizes:** `(organization_id, created_at)`, `(project_id, created_at)`,
`(entity_type, entity_id)`. **Löschen:** verboten (Manipulationsschutz);
Aufbewahrung per Archiv-Job.

## 25. invitations
**Zweck:** Einladungen (Agentur/Kunde/Gast). Registrierung nur per Einladung.

| Spalte | Typ | Pflicht | Hinweise |
|---|---|---|---|
| id | uuid PK | ✔ | |
| organization_id | uuid | ✔ | |
| client_company_id | uuid → client_companies.id | | nur bei Kunde/Gast |
| email | text | ✔ | |
| role | app_role | ✔ | nie `super_admin` |
| token_hash | text | ✔ | nur Hash speichern |
| invited_by | uuid → profiles.id | ✔ | |
| expires_at | timestamptz | ✔ | |
| accepted_at | timestamptz | | |
| revoked_at | timestamptz | | Widerruf |
| created_at | timestamptz | ✔ | |

**Unique:** aktive Einladung je `(organization_id, lower(email))` (partiell,
`where accepted_at is null and revoked_at is null`). **Indizes:** `token_hash`,
`email`. **Löschen:** hart bei Widerruf/Ablauf-Cleanup.

---

## Mandantenfähigkeit – Zuordnung je Tabelle

| Ebene | Trägerspalte | Betroffene Tabellen |
|---|---|---|
| Mandant (Agentur) | `organization_id` | **alle** fachlichen Tabellen |
| Kunde | `client_company_id` (direkt) | client_companies, client_contacts, projects, time_entries, approvals |
| Kunde (abgeleitet) | über `project_id` → project.client_company_id | tasks, comments, files, checklists, … |
| Projekt | `project_id` | boards, tasks, comments, files, time_entries, approvals |

**Wie fremder Zugriff verhindert wird (Kurzform, Details in `05`):**
- Jede Tabelle hat RLS aktiviert; kein Zugriff ohne passende Policy.
- Policies leiten die erlaubten `organization_id`-Werte **aus der Session**
  (`auth.uid()` → memberships) ab – **niemals** aus einem vom Client
  gesendeten Wert. Ein manipuliertes `organization_id` im Request greift daher
  ins Leere.
- Kundenzugriff wird zusätzlich über `client_contacts` + `project_members` auf
  das eigene Kundenunternehmen und freigegebene Projekte begrenzt.
- Interne Daten (`is_internal = true`) sind für `client`/`guest` per Policy
  unsichtbar.

## Generierte Typen

Nach jeder Migration: `supabase gen types typescript` →
`src/lib/database.types.ts` als Basis der typisierten Datenzugriffsschicht.
