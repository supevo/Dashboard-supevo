# Supevo Dashboard

Mandantenfähiges Projektmanagementsystem für eine Marketingagentur und deren
Kunden. Aufgaben, Kommunikation, Dateien, Freigaben und Zeiterfassung – strikt
mandantengetrennt, mit serverseitiger Autorisierung und PostgreSQL Row Level
Security.

> **Status: Phase 0 – Architektur.** Es ist noch kein Anwendungscode
> implementiert. Zunächst werden Architektur, Datenmodell und Rollenmatrix
> festgelegt und freigegeben.

## Dokumentation

Die vollständige Architektur liegt unter [`docs/architecture`](docs/architecture/00-overview.md):

1. [Übersicht & Entscheidungen](docs/architecture/00-overview.md)
2. [Anforderungsanalyse](docs/architecture/01-requirements-analysis.md)
3. [Technologie-Stack](docs/architecture/02-tech-stack.md)
4. [Datenmodell](docs/architecture/03-data-model.md)
5. [Rollen- & Berechtigungsmatrix](docs/architecture/04-role-matrix.md)
6. [Sicherheit: RLS, Uploads, Audit, DSGVO](docs/architecture/05-security-rls.md)
7. [Projektstruktur](docs/architecture/06-project-structure.md)
8. [Phasenplan & offene Punkte](docs/architecture/07-roadmap-phases.md)

## Konventionen

- **UI-Texte**: Deutsch. **Code & Datenbank**: Englisch.
- **Sicherheit**: Berechtigungen serverseitig **und** per RLS. Frontend prüft
  nie als Sicherheitsgrenze.
- **Interne Daten** (Kommentare, Dateien, Notizen, Zeiteinträge) sind für
  Kunden und Gäste niemals sichtbar.
