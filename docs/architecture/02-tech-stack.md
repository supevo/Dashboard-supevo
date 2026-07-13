# Technologie-Stack

## Überblick

| Bereich | Technologie | Begründung |
|---------|-------------|------------|
| Sprache | **TypeScript** (strict) | Durchgängige Typsicherheit, gefordert. |
| Framework | **Next.js 15** (App Router) | RSC + Server Actions erlauben serverseitige Rechteprüfung nah am UI; ein Deployment für Front- und Backend. |
| UI | **Tailwind CSS + shadcn/ui** | Schnelle, wartbare, barrierearme Komponenten; volle Kontrolle über Markup. |
| DB / Auth / Storage | **Supabase** (PostgreSQL 15+) | RLS explizit gefordert; integrierte Auth, Storage, Realtime, Edge Functions. |
| Validierung | **Zod** | Ein Schema für Laufzeitprüfung + statische Typen an jeder Servergrenze. |
| DB-Zugriff | **Supabase JS Client** + generierte Typen | RLS-konform über User-JWT; `supabase gen types` liefert typisierte Tabellen. |
| Migrationen | **Supabase CLI** (SQL-Migrationen) | SQL als Single Source of Truth, inkl. Policies und Funktionen. |
| State/Data | **TanStack Query** (Client) | Caching/Invalidierung für interaktive Ansichten. |
| Tests | **Vitest**, **pgTAP/SQL**, **Playwright** | Unit, RLS-Policy-Tests, E2E – siehe unten. |
| Lint/Format | **ESLint + Prettier** | Konsistenter Stil, CI-fähig. |
| CI | **GitHub Actions** | Typecheck, Lint, Test, RLS-Tests bei jedem PR. |

## Warum dieser Stack?

- **RLS ist gesetzt** (Anforderung 2) → Supabase/PostgreSQL ist die natürliche
  Wahl und liefert Auth + Storage + Realtime aus einer Hand.
- **Next.js App Router** erlaubt es, Berechtigungen in Server Actions und Route
  Handlern **serverseitig** zu prüfen, ohne separates Backend zu betreiben.
  Das erfüllt „nicht nur im Frontend prüfen“ ohne doppelte Infrastruktur.
- **TypeScript strict + Zod** erfüllt „streng typisiert“ und liefert
  verständliche, validierte Fehler an der Grenze.

## Zwei Supabase-Clients (wichtig für Sicherheit)

1. **User-Client (anon key + User-JWT)** – Standard für alle Nutzeraktionen.
   Unterliegt RLS. Wird in Server Components/Actions mit dem Session-Cookie
   erstellt.
2. **Service-Client (service-role key)** – **umgeht RLS**. Nur in klar
   abgegrenzten, serverseitigen Sonderfällen (z. B. Audit-Log-Insert,
   Systemjobs). Der Key liegt **ausschließlich** in Server-Umgebungsvariablen
   und gelangt niemals ins Client-Bundle. Jede Nutzung wird durch explizite
   Berechtigungsprüfung im Policy-Modul flankiert.

## Deployment – Empfehlung

Zwei Optionen, DSGVO-konform (EU):

### Empfohlen: Managed Supabase (Region EU/Frankfurt) + Next.js auf Plesk
- Supabase Cloud, Region `eu-central-1`.
- Next.js als Node-App auf dem vorhandenen Plesk-Server (Phusion Passenger)
  oder alternativ Vercel.
- **Vorteil**: geringster Betriebsaufwand, automatische Backups/Updates,
  DSGVO über AV-Vertrag (Data Processing Agreement) mit Supabase.

### Alternative: Vollständiges Self-Hosting auf Plesk (Docker)
- Supabase-Stack (Postgres, GoTrue, Storage, Kong, Realtime) via Docker
  Compose auf dem Plesk-Server.
- Next.js ebenfalls dort.
- **Vorteil**: volle Datenhoheit in DE. **Nachteil**: deutlich höherer
  Wartungs- und Sicherheitsaufwand (Updates, Backups, Monitoring selbst).

> **Empfehlung**: Start mit Managed Supabase EU zur schnellen, sicheren
> Umsetzung; Self-Hosting bleibt möglich, da wir ausschließlich Standard-
> Supabase-Features nutzen. Entscheidung dokumentieren (siehe Roadmap).

## Teststrategie

| Ebene | Werkzeug | Prüft |
|-------|----------|-------|
| RLS-Policies | pgTAP / SQL-Harness | Mandantentrennung, `is_internal`-Sichtbarkeit, Rollenrechte – **kritisch**. |
| Unit | Vitest | Policy-Modul, Zod-Schemata, Upload-Validierung, Domänenlogik. |
| Integration | Vitest + Supabase (Testinstanz) | Server Actions je Rolle. |
| E2E | Playwright | Kernflows je Rolle (Login, Aufgabe, Freigabe, Upload). |

RLS-Tests sind Pflichtbestandteil jeder Phase, die Tabellen/Policies
verändert. Sie stellen sicher, dass ein Kunde niemals fremde oder interne
Daten sehen kann – der wichtigste Sicherheitsnachweis des Systems.
