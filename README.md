# Supevo Dashboard

Mandantenfähiges Projektmanagementsystem für eine Marketingagentur und deren
Kunden. Aufgaben, Kommunikation, Dateien, Freigaben und Zeiterfassung – strikt
mandantengetrennt, mit serverseitiger Autorisierung und PostgreSQL Row Level
Security.

> **Status: Phase 1 – Technisches Fundament umgesetzt.** Architektur ist
> freigegeben; das Grundgerüst (Next.js, Supabase-Auth, geschützte Routen,
> rollenbasierte Layouts, erste Migration) steht. Fachmodule folgen phasenweise
> gemäß [Roadmap](docs/architecture/07-roadmap-phases.md).

## Technologie

Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS · shadcn-Stil-UI ·
Supabase (PostgreSQL, Auth, Storage) mit Row Level Security · Zod · Vitest.
Deployment: Self-Hosting auf Plesk (siehe `docs/architecture/02-tech-stack.md`).

## Installation & Entwicklung

Voraussetzungen: Node.js ≥ 20, Zugriff auf eine (self-hosted) Supabase-Instanz.

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Umgebungsvariablen anlegen
cp .env.example .env.local
#   -> Werte für NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#      SUPABASE_SERVICE_ROLE_KEY und NEXT_PUBLIC_APP_URL eintragen.

# 3. Datenbankmigration einspielen (Supabase CLI)
supabase db push          # wendet supabase/migrations/*.sql an

# 4. Entwicklungsserver starten
npm run dev               # http://localhost:3000
```

### Erste Nutzer anlegen

Es gibt **keine offene Registrierung**. Konten entstehen ausschließlich über
Einladungen (`/invite/[token]`). Der erste `agency_admin` und ein
`super_admin` werden per SQL/Seed direkt in der Datenbank angelegt (der
`super_admin` ist bewusst nie über die Oberfläche vergebbar).

### Nützliche Skripte

| Befehl | Zweck |
|--------|-------|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktions-Build |
| `npm run typecheck` | TypeScript-Prüfung (`tsc --noEmit`) |
| `npm run lint` | ESLint |
| `npm run test` | Unit-Tests (Vitest) |
| `npm run format` | Prettier |

## Dokumentation

Die vollständige Architektur liegt unter [`docs/architecture`](docs/architecture/00-overview.md):

1. [Übersicht & Entscheidungen](docs/architecture/00-overview.md)
2. [Anforderungsanalyse](docs/architecture/01-requirements-analysis.md)
3. [Technologie-Stack](docs/architecture/02-tech-stack.md)
4. [Datenmodell](docs/architecture/03-data-model.md)
5. [Rollen- & Berechtigungsmatrix](docs/architecture/04-role-matrix.md)
6. [Sicherheit: RLS, Uploads, XSS, CSRF, Rate Limits, Audit, DSGVO](docs/architecture/05-security-rls.md)
7. [Projektstruktur](docs/architecture/06-project-structure.md)
8. [Phasenplan, MVP-Abgrenzung & offene Punkte](docs/architecture/07-roadmap-phases.md)
9. [Seiten- & Routenstruktur](docs/architecture/08-pages-routes.md)

## Konventionen

- **UI-Texte**: Deutsch. **Code & Datenbank**: Englisch.
- **Sicherheit**: Berechtigungen serverseitig **und** per RLS. Frontend prüft
  nie als Sicherheitsgrenze.
- **Interne Daten** (Kommentare, Dateien, Notizen, Zeiteinträge) sind für
  Kunden und Gäste niemals sichtbar.
