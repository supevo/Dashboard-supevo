# Datenmodell

Alle Bezeichner in **Englisch**. PostgreSQL/Supabase. Jede mandantenbezogene
Tabelle trägt `organization_id`. Zeitstempel: `created_at`, `updated_at`
(UTC, `timestamptz`). Primärschlüssel: `uuid` (`gen_random_uuid()`).

## Konventionen

- Soft-Delete über `deleted_at timestamptz NULL` bei fachlich relevanten
  Entitäten (Projekte, Aufgaben, Dateien) – RLS blendet gelöschte Zeilen aus.
- `is_internal boolean NOT NULL DEFAULT true` auf allen Entitäten mit
  Sichtbarkeitsgrenze (Kommentare, Dateien, Notizen, Zeiteinträge). **Default
  = intern** (sicher per Voreinstellung; kundensichtbar ist eine bewusste
  Entscheidung).
- Enums als PostgreSQL-`enum`-Typen für stabile, typisierte Wertebereiche.

## Enum-Typen

```sql
create type organization_type as enum ('agency', 'client');

create type app_role as enum (
  'super_admin', 'agency_admin', 'project_manager',
  'employee', 'freelancer', 'client', 'guest'
);

create type membership_status as enum ('invited', 'active', 'suspended');

create type project_status as enum ('planned', 'active', 'on_hold', 'completed', 'archived');

create type project_member_role as enum ('lead', 'contributor', 'viewer', 'client');

create type task_status as enum ('todo', 'in_progress', 'in_review', 'blocked', 'done');

create type task_priority as enum ('low', 'medium', 'high', 'urgent');

create type approval_status as enum ('pending', 'approved', 'rejected', 'changes_requested');

create type activity_action as enum (
  'create', 'update', 'delete', 'status_change',
  'role_change', 'login', 'logout', 'file_upload',
  'file_download', 'approval_request', 'approval_decision', 'invite'
);
```

## Tabellen

### organizations
Der Mandant. Agentur oder Kunde.

| Spalte | Typ | Hinweise |
|--------|-----|----------|
| id | uuid PK | |
| name | text NOT NULL | |
| type | organization_type NOT NULL | `agency` \| `client` |
| slug | text UNIQUE NOT NULL | für URLs |
| billing_email | text | |
| settings | jsonb NOT NULL DEFAULT '{}' | mandantenspezifische Konfiguration |
| created_at / updated_at | timestamptz | |

### profiles
Erweiterung von `auth.users` (1:1). Enthält keine Rolle – Rollen liegen in
`memberships` (ein User kann perspektivisch mehreren Orgs angehören).

| Spalte | Typ | Hinweise |
|--------|-----|----------|
| id | uuid PK | = `auth.users.id` |
| full_name | text | |
| avatar_url | text | |
| locale | text NOT NULL DEFAULT 'de' | |
| created_at / updated_at | timestamptz | |

### memberships
User ↔ Organization mit globaler Rolle. **Zentrale Autorisierungstabelle.**

| Spalte | Typ | Hinweise |
|--------|-----|----------|
| id | uuid PK | |
| user_id | uuid FK → profiles.id | |
| organization_id | uuid FK → organizations.id | |
| role | app_role NOT NULL | globale Rolle in dieser Org |
| status | membership_status NOT NULL DEFAULT 'invited' | |
| created_at / updated_at | timestamptz | |
| | UNIQUE(user_id, organization_id) | |

> `super_admin` wird als Membership in der Agentur-Org mit Rolle `super_admin`
> geführt und in Policy-Funktionen gesondert behandelt (systemweiter Zugriff).

### invitations
Einladungen für neue Nutzer (Agenturmitarbeiter, Kunden, Gäste).

| Spalte | Typ | Hinweise |
|--------|-----|----------|
| id | uuid PK | |
| organization_id | uuid FK | Ziel-Org |
| email | text NOT NULL | |
| role | app_role NOT NULL | |
| token_hash | text NOT NULL | Hash, nie Klartext-Token speichern |
| invited_by | uuid FK → profiles.id | |
| expires_at | timestamptz NOT NULL | |
| accepted_at | timestamptz | |
| created_at | timestamptz | |

### projects
Gehört einer Kundenorganisation; betreut von der Agentur.

| Spalte | Typ | Hinweise |
|--------|-----|----------|
| id | uuid PK | |
| organization_id | uuid FK → organizations.id | **Kunden-Org** (Mandant des Projekts) |
| name | text NOT NULL | |
| description | text | |
| status | project_status NOT NULL DEFAULT 'planned' | |
| lead_user_id | uuid FK → profiles.id | Projektleiter |
| start_date / due_date | date | |
| created_at / updated_at / deleted_at | timestamptz | |

### project_members
User ↔ Project. Steuert, wer ein Projekt sieht, und die Projektrolle.
Ein Kundennutzer ist hier mit `role = 'client'` verknüpft.

| Spalte | Typ | Hinweise |
|--------|-----|----------|
| id | uuid PK | |
| project_id | uuid FK → projects.id | |
| user_id | uuid FK → profiles.id | |
| role | project_member_role NOT NULL | projektbezogene Rolle |
| created_at | timestamptz | |
| | UNIQUE(project_id, user_id) | |

### tasks
Aufgaben und Unteraufgaben (`parent_task_id`).

| Spalte | Typ | Hinweise |
|--------|-----|----------|
| id | uuid PK | |
| organization_id | uuid FK | = Projekt-Org (denormalisiert für RLS-Performance) |
| project_id | uuid FK → projects.id | |
| parent_task_id | uuid FK → tasks.id NULL | Unteraufgabe |
| title | text NOT NULL | |
| description | text | |
| status | task_status NOT NULL DEFAULT 'todo' | |
| priority | task_priority NOT NULL DEFAULT 'medium' | |
| assignee_id | uuid FK → profiles.id NULL | |
| is_internal | boolean NOT NULL DEFAULT true | kundensichtbar nur wenn false |
| position | numeric | Sortierung im Board |
| due_date | date | |
| created_by | uuid FK → profiles.id | |
| created_at / updated_at / deleted_at | timestamptz | |

### task_comments
Kommentare an Aufgaben. `is_internal` = interne Kommunikation.

| Spalte | Typ | Hinweise |
|--------|-----|----------|
| id | uuid PK | |
| organization_id | uuid FK | |
| task_id | uuid FK → tasks.id | |
| author_id | uuid FK → profiles.id | |
| body | text NOT NULL | |
| is_internal | boolean NOT NULL DEFAULT true | |
| created_at / updated_at / deleted_at | timestamptz | |

### notes
Freie Notizen an Projekt oder Aufgabe (polymorph über `entity_type`/`entity_id`
oder je eigene Spalten – hier explizit gehalten).

| Spalte | Typ | Hinweise |
|--------|-----|----------|
| id | uuid PK | |
| organization_id | uuid FK | |
| project_id | uuid FK NULL | |
| task_id | uuid FK NULL | |
| author_id | uuid FK → profiles.id | |
| body | text NOT NULL | |
| is_internal | boolean NOT NULL DEFAULT true | |
| created_at / updated_at / deleted_at | timestamptz | |

### files
Metadaten zu Dateien. Der Binärinhalt liegt in Supabase Storage; hier nur
Metadaten + Speicherpfad.

| Spalte | Typ | Hinweise |
|--------|-----|----------|
| id | uuid PK | |
| organization_id | uuid FK | |
| project_id | uuid FK NULL | |
| task_id | uuid FK NULL | |
| uploaded_by | uuid FK → profiles.id | |
| storage_path | text NOT NULL UNIQUE | serverseitig erzeugt, nie vom Client |
| file_name | text NOT NULL | Originalname (nur Anzeige) |
| mime_type | text NOT NULL | serverseitig validiert |
| size_bytes | bigint NOT NULL | serverseitig validiert |
| checksum_sha256 | text | Integrität/Deduplizierung |
| is_internal | boolean NOT NULL DEFAULT true | |
| created_at / deleted_at | timestamptz | |

### time_entries
Zeiterfassung. Grundsätzlich intern; `is_client_visible` macht Einträge für
den Kunden sichtbar (z. B. abrechenbare Leistung).

| Spalte | Typ | Hinweise |
|--------|-----|----------|
| id | uuid PK | |
| organization_id | uuid FK | |
| project_id | uuid FK → projects.id | |
| task_id | uuid FK NULL | |
| user_id | uuid FK → profiles.id | |
| minutes | integer NOT NULL CHECK (minutes > 0) | |
| description | text | |
| is_billable | boolean NOT NULL DEFAULT true | |
| is_client_visible | boolean NOT NULL DEFAULT false | interne Sicht per Default |
| entry_date | date NOT NULL | |
| created_at / updated_at | timestamptz | |

### approvals
Freigaben. Verknüpft ein freizugebendes Objekt (Datei/Aufgabe) mit einer
Kundenentscheidung.

| Spalte | Typ | Hinweise |
|--------|-----|----------|
| id | uuid PK | |
| organization_id | uuid FK | Kunden-Org des Projekts |
| project_id | uuid FK → projects.id | |
| subject_type | text NOT NULL | 'file' \| 'task' |
| subject_id | uuid NOT NULL | Referenz auf files/tasks |
| title | text NOT NULL | |
| status | approval_status NOT NULL DEFAULT 'pending' | |
| requested_by | uuid FK → profiles.id | Agentur |
| decided_by | uuid FK → profiles.id NULL | Kunde/Gast |
| decision_comment | text | |
| decided_at | timestamptz | |
| created_at / updated_at | timestamptz | |

### activity_log (append-only)
Aktivitätsprotokoll. **Nur INSERT** per Policy; kein UPDATE/DELETE.

| Spalte | Typ | Hinweise |
|--------|-----|----------|
| id | uuid PK | |
| organization_id | uuid FK NULL | betroffener Mandant |
| actor_id | uuid FK → profiles.id NULL | handelnder Nutzer |
| action | activity_action NOT NULL | |
| entity_type | text NOT NULL | z. B. 'task', 'file' |
| entity_id | uuid NULL | |
| metadata | jsonb NOT NULL DEFAULT '{}' | Kontext (Diff, IP, o. Ä.) |
| created_at | timestamptz NOT NULL DEFAULT now() | |

## Beziehungsdiagramm (vereinfacht)

```
organizations 1───* memberships *───1 profiles(=auth.users)
organizations 1───* projects
projects      1───* project_members *───1 profiles
projects      1───* tasks 1───* task_comments
tasks         1───* tasks (parent_task_id)
projects/tasks 1──* files
projects/tasks 1──* notes
projects/tasks 1──* time_entries
projects      1───* approvals ──> (files|tasks)
*             ───* activity_log (append-only)
```

## Indizes (Auswahl)

- Jede FK-Spalte, insbesondere `organization_id`, `project_id`, `task_id`.
- Zusammengesetzt: `(organization_id, is_internal)` auf sichtbarkeits-
  relevanten Tabellen für effiziente RLS-Filterung.
- `project_members(user_id)` und `memberships(user_id)` für Policy-Funktionen.

## Generierte Typen

Nach jeder Migration: `supabase gen types typescript` → `src/lib/database.types.ts`.
Diese Typen sind die Grundlage der typisierten Datenzugriffs-Schicht.
