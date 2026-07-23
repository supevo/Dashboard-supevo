# Rollen- und Berechtigungsmatrix

## Zwei Berechtigungsebenen

1. **Globale Rolle** (`memberships.role`) – je Organisation.
2. **Projektrolle** (`project_members.role`) – verfeinert im Projektkontext.

Die effektive Berechtigung wird zentral im Policy-Modul (`src/lib/authz`)
berechnet und in RLS gespiegelt. **Keine verstreuten Rollenprüfungen** – jede
serverseitige Aktion ruft dieselbe zentrale Funktion `can(user, action,
resource)` auf.

## Die sieben Rollen

| Rolle (DE) | Code | Ebene | Kurz |
|---|---|---|---|
| Super Administrator | `super_admin` | systemweit | Betrieb/Wartung, org-übergreifend. Nie über UI vergebbar. |
| Agentur Administrator | `agency_admin` | Organisation | Verwaltet Org, Kunden, Nutzer, alle Projekte, Einstellungen. |
| Projektleiter | `project_manager` | Organisation | Verantwortet zugewiesene Projekte inkl. interner Daten. |
| Mitarbeiter | `employee` | Organisation | Bearbeitet zugewiesene Aufgaben, erfasst Zeit. |
| Freelancer | `freelancer` | Organisation (extern) | Wie Mitarbeiter, strenger begrenzt; keine Kunden-/Finanzverwaltung. |
| Kunde | `client` | Kunde | Nur eigenes Kundenunternehmen, nur nicht-interne Daten. |
| Gast | `guest` | punktuell | Sehr eingeschränkt, meist zeitlich begrenzt (z. B. Freigabe-Link). |

## Grundprinzipien

- Interne Daten (`is_internal = true` / `is_client_visible = false`) sind für
  `client`/`guest` **niemals** sichtbar (RLS-hart).
- **Niemand darf eigene Rechte erhöhen.** Eine Rollenänderung des eigenen
  Datensatzes auf eine höhere Rolle ist serverseitig verboten.
- **`super_admin` wird nie über die UI vergeben** – nur per Migration/DB.
- **Least Privilege**: Standardrolle neuer Agenturnutzer = `employee`.

## Vollständige Matrix (Ressource × Rolle)

Legende: **F**=voll · **P**=eingeschränkt (Fußnote) · **E**=eigene · **–**=kein Zugriff
Aktionen: C=create, R=read, U=update, D=delete

| Ressource | super_admin | agency_admin | project_manager | employee | freelancer | client | guest |
|---|---|---|---|---|---|---|---|
| **Organisationen** | CRUD | RU¹ | R | R | R | – | – |
| **Kunden (client_companies)** | CRUD | CRUD | R | R | P² | – | – |
| **Projekte** | CRUD | CRUD | P³ CRUD | R⁴ | R⁴ | R⁵ | R⁶ |
| **Boards / Spalten** | CRUD | CRUD | P³ CRUD | R⁴ | R⁴ | R⁵ | – |
| **Aufgaben** | CRUD | CRUD | P³ CRUD | P⁴ CRU | P⁴ CRU | P⁵ CR⁷ | R⁶ |
| **Kommentare (extern)** | CRUD | CRUD | CRUD | CRU-E | CRU-E | P⁵ CRU-E | R⁶ |
| **Interne Kommentare** | CRUD | CRUD | P³ CRUD | P⁴ CRU-E | P⁴ CRU-E | – | – |
| **Dateien (extern)** | CRUD | CRUD | CRUD | CRU-E | CRU-E | P⁵ CR | R⁶ |
| **Interne Dateien** | CRUD | CRUD | P³ CRUD | P⁴ CRU-E | P⁴ CRU-E | – | – |
| **Zeiteinträge** | CRUD | CRUD | P³ R + CRUD-E | CRUD-E | CRUD-E | – | – |
| **Zeiteinträge (kundensichtbar)** | R | R | R | R | R | R⁵ | – |
| **Freigaben** | CRUD | CRU | CRU | P⁴ C | P⁴ C | P⁵ entscheiden⁸ | P⁶ entscheiden⁸ |
| **Benutzerverwaltung** | CRUD | CRUD⁹ | P³ (Projektmitglieder) | – | – | – | – |
| **Rollen ändern** | F | P⁹ | P¹⁰ | – | – | – | – |
| **Berichte** | F | F (Org) | P³ (eigene Projekte) | E¹¹ | E¹¹ | P⁵ (eigenes Projekt) | – |
| **Einstellungen** | F | F (Org) | P³ (Projekt) | – | – | – | – |
| **Aktivitätsprotokoll** | F | R (Org) | P³ (Projekt) | – | – | – | – |
| **Labels** | CRUD | CRUD | R + zuweisen | R + zuweisen | R + zuweisen | R¹² | – |

### Fußnoten

1. `agency_admin` bearbeitet nur die **eigene** Organisation, nicht andere Orgs
   oder Plattformkonfiguration.
2. `freelancer` sieht Kundenunternehmen nur, soweit es zu einem zugewiesenen
   Projekt gehört; keine Kundenverwaltung.
3. `project_manager` nur für Projekte, in denen er/sie `lead` bzw.
   `projects.lead_user_id` ist.
4. `employee`/`freelancer` nur in Projekten mit `project_members`-Eintrag;
   Schreiben nur an zugewiesenen/relevanten Aufgaben.
5. `client` nur für Projekte der **eigenen** `client_company`, die freigegeben
   sind (`projects.is_client_visible = true` + `project_members`), und nur
   Datensätze mit `is_internal = false` / `is_client_visible = true`.
6. `guest` nur für das konkret geteilte Objekt (z. B. eine Freigabe), i. d. R.
   zeitlich begrenzt; keine freie Navigation.
7. `client` darf Aufgaben nur **einreichen** (nicht Board-intern verschieben).
8. Freigabe erteilen / Änderungen anfordern; bei Ablehnung ist ein Kommentar
   Pflicht.
9. `agency_admin` darf Rollen bis `agency_admin` vergeben, **niemals**
   `super_admin`.
10. `project_manager` setzt nur **Projektrollen** (`project_members.role`),
    keine globalen Rollen.
11. `employee`/`freelancer` sehen in Berichten nur **eigene** Kennzahlen
    (z. B. eigene Zeiten), sofern nicht projektweit freigegeben.
12. `client` sieht nur Labels mit `is_client_visible = true`.

## Ableitung in RLS

Zentrale `SECURITY DEFINER`-Hilfsfunktionen (Details in `05-security-rls.md`):
`is_super_admin()`, `is_agency_staff()`, `current_user_org_ids()`,
`current_user_client_company_ids()`, `can_access_project(uuid)`,
`can_see_internal(uuid)`, `can_manage_project(uuid)`.

Jede Matrixzeile erhält mindestens einen automatisierten RLS-/Authz-Test.
