# Rollen- und Berechtigungsmatrix

## Rollenmodell

Es gibt **zwei Ebenen**:

1. **Globale Rolle** (`memberships.role`) – gilt für eine Organisation.
2. **Projektrolle** (`project_members.role`) – gilt für ein konkretes Projekt
   und kann die globale Rolle im Projektkontext verfeinern (z. B. ist ein
   `employee` in Projekt A `lead`, in Projekt B `contributor`).

Die effektive Berechtigung ergibt sich aus der Kombination beider Ebenen und
wird zentral im Policy-Modul (`src/lib/authz`) sowie in RLS-Funktionen
berechnet.

## Die sieben Rollen

| Rolle (DE) | Code | Ebene | Kurzbeschreibung |
|------------|------|-------|------------------|
| Super Administrator | `super_admin` | systemweit | Betreibt die Plattform; Zugriff über alle Organisationen; verwaltet Agentur-Grundkonfiguration. |
| Agentur Administrator | `agency_admin` | Agentur | Verwaltet Nutzer, Kunden, alle Projekte der Agentur; voller interner Zugriff. |
| Projektleiter | `project_manager` | Agentur | Verantwortet zugewiesene Projekte inkl. Mitgliedern, Freigaben, interner Daten. |
| Mitarbeiter | `employee` | Agentur | Bearbeitet zugewiesene Aufgaben, erfasst Zeit, sieht interne Daten seiner Projekte. |
| Freelancer | `freelancer` | Agentur (extern) | Wie Mitarbeiter, aber strikter auf zugewiesene Projekte begrenzt; kein Zugriff auf Kunden-/Finanzverwaltung. |
| Kunde | `client` | Kunde | Sieht ausschließlich eigene Organisation, ausschließlich **nicht-interne** Daten; kommentiert, lädt hoch, erteilt Freigaben. |
| Gast | `guest` | punktuell | Stark eingeschränkter, meist zeitlich begrenzter Zugriff auf einzelne geteilte Objekte (z. B. eine Freigabe). |

## Grundprinzipien

- **Interne Daten** (`is_internal = true` bzw. `is_client_visible = false`)
  sind für `client` und `guest` **niemals** sichtbar – hart per RLS.
- **Agenturrollen** (`agency_admin`, `project_manager`, `employee`,
  `freelancer`) sehen interne Daten, aber nur in Projekten, denen sie
  zugewiesen sind (Ausnahme: `agency_admin` sieht alle Agenturprojekte).
- **`super_admin`** umgeht die Projekt-/Org-Grenzen (systemweite Wartung),
  bleibt aber vollständig auditiert.
- **Least Privilege**: Standardrolle für neue Agenturnutzer ist `employee`,
  nicht Admin.

## Berechtigungsmatrix (Ressource × Rolle × Aktion)

Legende: ✔ erlaubt · ✱ eingeschränkt (siehe Fußnote) · ✖ verboten

| Ressource / Aktion | super_admin | agency_admin | project_manager | employee | freelancer | client | guest |
|---|---|---|---|---|---|---|---|
| **Organisationen verwalten** | ✔ | ✱¹ | ✖ | ✖ | ✖ | ✖ | ✖ |
| **Kunden(-Orgs) anlegen** | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ |
| **Agenturnutzer verwalten** | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ |
| **Rollen zuweisen** | ✔ | ✱² | ✱³ | ✖ | ✖ | ✖ | ✖ |
| **Kundennutzer einladen** | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| **Projekt anlegen** | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| **Projekt bearbeiten/archivieren** | ✔ | ✔ | ✱⁴ | ✖ | ✖ | ✖ | ✖ |
| **Projekt sehen** | ✔ | ✔(alle) | ✱⁴ | ✱⁵ | ✱⁵ | ✱⁶ | ✱⁷ |
| **Projektmitglieder verwalten** | ✔ | ✔ | ✱⁴ | ✖ | ✖ | ✖ | ✖ |
| **Aufgabe erstellen/bearbeiten** | ✔ | ✔ | ✔ | ✱⁵ | ✱⁵ | ✖ | ✖ |
| **Aufgabe sehen (intern)** | ✔ | ✔ | ✱⁴ | ✱⁵ | ✱⁵ | ✖ | ✖ |
| **Aufgabe sehen (kundensichtbar)** | ✔ | ✔ | ✔ | ✔ | ✔ | ✱⁶ | ✱⁷ |
| **Interner Kommentar (lesen/schreiben)** | ✔ | ✔ | ✱⁴ | ✱⁵ | ✱⁵ | ✖ | ✖ |
| **Kundensichtbarer Kommentar** | ✔ | ✔ | ✔ | ✔ | ✔ | ✱⁶ | ✱⁷ |
| **Interne Datei (lesen/hochladen)** | ✔ | ✔ | ✱⁴ | ✱⁵ | ✱⁵ | ✖ | ✖ |
| **Kundensichtbare Datei** | ✔ | ✔ | ✔ | ✔ | ✔ | ✱⁶ | ✱⁷ |
| **Interne Notiz** | ✔ | ✔ | ✱⁴ | ✱⁵ | ✱⁵ | ✖ | ✖ |
| **Zeit erfassen** | ✔ | ✔ | ✔ | ✱⁵ | ✱⁵ | ✖ | ✖ |
| **Zeiteinträge sehen (intern)** | ✔ | ✔ | ✱⁴ | ✱⁸ | ✱⁸ | ✖ | ✖ |
| **Zeiteinträge sehen (kundensichtbar)** | ✔ | ✔ | ✔ | ✔ | ✔ | ✱⁶ | ✖ |
| **Freigabe anfordern** | ✔ | ✔ | ✔ | ✱⁵ | ✱⁵ | ✖ | ✖ |
| **Freigabe erteilen/ablehnen** | ✔ | ✖ | ✖ | ✖ | ✖ | ✱⁶ | ✱⁷ |
| **Aktivitätsprotokoll einsehen** | ✔ | ✔(Agentur) | ✱⁴ | ✖ | ✖ | ✖ | ✖ |

### Fußnoten

1. `agency_admin` verwaltet nur die eigene Agentur-Org und die von ihr
   angelegten Kundenorganisationen, nicht die Plattform selbst.
2. `agency_admin` darf keine `super_admin`-Rolle vergeben.
3. `project_manager` darf Rollen nur **innerhalb eigener Projekte** auf
   Projektebene (`project_members.role`) setzen, keine globalen Rollen.
4. `project_manager` nur für Projekte, in denen er/sie `lead` ist bzw.
   `projects.lead_user_id` gesetzt ist.
5. `employee`/`freelancer` nur in Projekten, denen sie als `project_members`
   zugewiesen sind. `freelancer` zusätzlich ohne Zugriff auf Kunden- und
   Finanzverwaltung.
6. `client` nur für Projekte der **eigenen** Organisation und nur Datensätze
   mit `is_internal = false` bzw. `is_client_visible = true`.
7. `guest` nur für das konkret geteilte Objekt (z. B. eine Freigabe), i. d. R.
   zeitlich begrenzt; keine Projektnavigation.
8. Sichtbarkeit interner Zeiteinträge für `employee`/`freelancer` kann auf
   „eigene Einträge“ begrenzt werden (Konfigurationsentscheidung, siehe
   offene Punkte).

## Ableitung in RLS

Diese Matrix wird in `05-security-rls.md` in konkrete PostgreSQL-Policies und
`SECURITY DEFINER`-Hilfsfunktionen übersetzt:

- `is_super_admin()`
- `is_agency_staff()`
- `current_user_org_ids()`
- `can_access_project(p_project_id uuid)`
- `can_see_internal(p_project_id uuid)`

Jede Zeile der Matrix erhält mindestens einen RLS-Test (siehe Teststrategie).
