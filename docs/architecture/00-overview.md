# Supevo Dashboard – Architekturübersicht

> Mandantenfähiges Projektmanagementsystem für eine Marketingagentur und deren Kunden.
> Sprache: UI-Texte **Deutsch**, Code & Datenbank **Englisch**.

Dieses Dokument ist der Einstiegspunkt für die Architektur. Es fasst die
zentralen Entscheidungen zusammen und verweist auf die Detaildokumente.

## Dokumentenübersicht

| Datei | Inhalt |
|-------|--------|
| `01-requirements-analysis.md` | Anforderungsanalyse, Akteure, Kernkonzepte |
| `02-tech-stack.md` | Technologieauswahl inkl. Begründung |
| `03-data-model.md` | Vollständiges Datenmodell (Tabellen, Beziehungen) |
| `04-role-matrix.md` | Rollen und Berechtigungsmatrix |
| `05-security-rls.md` | Sicherheitskonzept: RLS, Uploads, XSS, CSRF, Rate Limits, Audit, DSGVO |
| `06-project-structure.md` | Empfohlene Verzeichnis- und Modulstruktur |
| `07-roadmap-phases.md` | Phasenplan (Ziel/Tests/Risiken), MVP-Abgrenzung, offene Punkte |
| `08-pages-routes.md` | Vollständige Seiten- und Routenstruktur |

## Zentrale Architekturentscheidungen (Kurzfassung)

1. **Shared-Database / Shared-Schema Mandantenfähigkeit**
   Jede mandantenbezogene Tabelle trägt eine `organization_id`. Die Trennung
   wird **hart auf Datenbankebene** über PostgreSQL Row Level Security (RLS)
   erzwungen – nicht (nur) in der Anwendung.

2. **Organisation (Mandant) vs. Kundenunternehmen**
   Die Agentur ist eine **Organisation** (`organization`, Typ `agency`) – der
   Mandant. Kunden werden als **Kundenunternehmen** (`client_company`)
   **innerhalb** einer Organisation geführt. Projekte gehören zu einem
   Kundenunternehmen. Kundennutzer sind Mitglied der Organisation (Rolle
   `client`) und über `client_contacts` einem Kundenunternehmen zugeordnet.
   Damit gilt: Mandantentrennung über `organization_id`, Kundentrennung über
   `client_company_id`. Mehrere Organisationen (White-Label) sind modellseitig
   vorbereitet.

   > Hinweis: Dies löst einen früheren Entwurf ab, der jeden Kunden als eigene
   > Organisation modellierte. Die getrennte `client_company`-Ebene folgt der
   > vollständigen Spezifikation („Organisationen" und „Kundenunternehmen" als
   > getrennte Bereiche; Nutzer in mehreren Organisationen möglich).

3. **Zweistufige Autorisierung**
   RLS ist die harte Grenze (Defense in Depth). Zusätzlich prüfen alle
   Server Actions / Route Handler serverseitig Berechtigungen über ein
   zentrales Policy-Modul. Das Frontend prüft nur zur UI-Steuerung, niemals
   als Sicherheitsgrenze.

4. **Interne vs. kundensichtbare Daten**
   Kommentare, Dateien, Zeiteinträge und Notizen tragen ein `is_internal`-Flag.
   RLS-Policies verhindern, dass Rollen `client` und `guest` interne Daten
   jemals lesen können – unabhängig vom Frontend.

5. **Lückenloses Aktivitätsprotokoll**
   Eine `activity_log`-Tabelle ist append-only (nur INSERT erlaubt, kein
   UPDATE/DELETE). Kritische Aktionen werden serverseitig protokolliert.

## Annahmen (zu bestätigen)

Diese Annahmen liegen dem Entwurf zugrunde. Bitte gegenlesen – Änderungen
hier wirken sich auf das Datenmodell aus.

- **A1** – In v1 gibt es eine Agentur-Organisation (Supevo). Mehrere
  Organisationen (White-Label) sind modellseitig vorbereitet, aber nicht Teil
  von v1.
- **A2** – Ein Projekt gehört immer **genau einem** Kundenunternehmen.
- **A3** – Ein Kundennutzer gehört (über `client_contacts`) zu mindestens einem
  Kundenunternehmen innerhalb einer Organisation.
- **A4** – Zeiterfassung ist grundsätzlich intern; einzelne Einträge können
  explizit als kundensichtbar / abrechenbar markiert werden.
- **A5** – Datenhaltung in der EU ist verpflichtend (DSGVO). Region Frankfurt
  (Supabase EU) bzw. Self-Hosting in DE.
- **A6** – „Gast“ ist eine sehr eingeschränkte, meist zeitlich begrenzte Rolle
  für einzelne geteilte Objekte (z. B. eine Freigabe per Link), kein
  vollwertiger Projektzugang.

## Offene Entscheidungspunkte

Siehe `07-roadmap-phases.md` für Details. Wichtigste Punkte:

- **Deployment**: Managed Supabase (EU) + Next.js auf Vercel/Plesk, **oder**
  vollständiges Self-Hosting auf dem Plesk-Server (Docker). Empfehlung siehe
  `02-tech-stack.md`.
- **Echtzeit**: Umfang von Supabase Realtime (Live-Kommentare, Präsenz) in
  einer späteren Phase.
- **Abrechnung/Rechnungen**: Ob aus Zeiterfassung Rechnungen erzeugt werden
  sollen – noch nicht spezifiziert.
