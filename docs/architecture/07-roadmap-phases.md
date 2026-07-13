# Phasenplan, offene Punkte, technische Schulden

Umsetzung strikt phasenweise. Es wird immer nur an der **konkret beauftragten
Phase** gearbeitet. Nach jeder Phase: Typprüfung, Linting, Tests.

## Phasenplan

### Phase 0 – Architektur & Freigabe (dieses Dokumentenpaket)
- Anforderungsanalyse, Tech-Stack, Datenmodell, Rollenmatrix, Sicherheits-
  konzept, Projektstruktur.
- **Ergebnis**: Freigabe durch Auftraggeber. **Kein Anwendungscode.**

### Phase 1 – Fundament
- Next.js-Projekt, TypeScript strict, ESLint/Prettier, Vitest/Playwright,
  CI-Pipeline.
- Supabase-Setup, Enums + Kern­tabellen (`organizations`, `profiles`,
  `memberships`), RLS-Hilfsfunktionen.
- Auth (Login, Session, Middleware), erste RLS-Tests (Mandantentrennung).
- **Dateien**: `supabase/migrations/0001..0003`, `src/lib/supabase/*`,
  `src/lib/authz/*`, `src/lib/errors.ts`, `src/lib/i18n/de.ts`.
- **Tabellen**: organizations, profiles, memberships.
- **Tests**: RLS Tenant-Isolation, authz-Policy-Unit-Tests.

### Phase 2 – Organisationen, Nutzer, Rollen
- Kundenorganisationen anlegen, Einladungen, Rollenverwaltung.
- Vollständige Rollenmatrix in `authz` + RLS.
- Aktivitätsprotokoll (append-only) inkl. erster Events.

### Phase 3 – Projekte & Aufgaben
- Projekte, Projektmitglieder, Aufgaben/Unteraufgaben, Board/Liste.
- `is_internal` durchgängig, RLS + Tests zur Kundensichtbarkeit.

### Phase 4 – Kommunikation & Notizen
- Kommentare (intern/kundensichtbar), Notizen, Erwähnungen, Benachrichtigungen.

### Phase 5 – Dateien
- Sicherer Upload/Download, Storage-Policies, Signed URLs, Validierung.

### Phase 6 – Freigaben
- Freigabe-Workflow, Kundenentscheidung, optional Gast-Freigabe per Link.

### Phase 7 – Zeiterfassung & Auswertungen
- Zeiteinträge, abrechenbar/kundensichtbar, Reports.

### Phase 8 – DSGVO & Betrieb
- Auskunft/Löschung, Aufbewahrung, Monitoring, Backups, ggf. Virenscan.

## Offene Entscheidungspunkte

| # | Punkt | Empfehlung |
|---|-------|-----------|
| O1 | Deployment: Managed Supabase EU vs. Self-Hosting Plesk | Start mit Managed Supabase EU. |
| O2 | Sichtbarkeit interner Zeiteinträge: alle Agenturrollen vs. nur eigene | Mitarbeiter/Freelancer nur eigene; PM/Admin alle. |
| O3 | Umfang Echtzeit (Realtime) für Kommentare/Präsenz | Später (Phase 4+), zunächst optimistisches UI. |
| O4 | Benachrichtigungen: E-Mail (welcher Versand?) / In-App | Klären; In-App zuerst. |
| O5 | Rechnungsstellung aus Zeiterfassung | Aktuell außerhalb Umfang. |
| O6 | White-Label (mehrere Agenturen) | Modell vorbereitet, aktuell 1 Agentur. |
| O7 | Datei-Versionierung | Ausbaustufe nach Phase 5. |

## Technische Schulden (laufend zu pflegen)

- Virenscan für Uploads zunächst optional → als Schuld führen, bis umgesetzt.
- Volltextsuche über Aufgaben/Dateien noch nicht geplant.
- Feingranulare Feldberechtigungen (z. B. Budget nur für PM) noch nicht
  modelliert.

## Definition of Done je Phase

1. Migrationen + RLS-Policies vorhanden und getestet.
2. Server Actions mit Zod-Validierung, Authz-Prüfung und Audit-Logging.
3. Deutsche UI-Texte, verständliche Fehlermeldungen.
4. Unit-, RLS- und (für Kernflows) E2E-Tests grün.
5. `tsc --noEmit`, ESLint und Tests in CI grün.
6. Offene Punkte/Schulden dokumentiert.
