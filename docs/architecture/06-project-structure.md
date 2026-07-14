# Empfohlene Projektstruktur

Monorepo-freundlich, aber zunächst als **einzelne Next.js-Anwendung** mit
klarer Modultrennung. Feature-orientierte Ordnerstruktur (Vertical Slices)
statt technischer Schichten, damit jede Fachdomäne in sich geschlossen bleibt.

```
Dashboard-supevo/
├─ docs/
│  └─ architecture/            # diese Dokumente
├─ supabase/
│  ├─ migrations/              # SQL-Migrationen (Single Source of Truth)
│  │  ├─ 0001_enums.sql
│  │  ├─ 0002_core_tables.sql
│  │  ├─ 0003_rls_functions.sql
│  │  ├─ 0004_rls_policies.sql
│  │  └─ 0005_storage_policies.sql
│  ├─ tests/                   # pgTAP / SQL-RLS-Tests
│  │  ├─ rls_tenant_isolation.sql
│  │  ├─ rls_internal_visibility.sql
│  │  └─ rls_role_permissions.sql
│  └─ seed.sql                 # Testdaten (Rollen, Orgs, Projekte)
├─ src/
│  ├─ app/                     # Next.js App Router
│  │  ├─ (auth)/               # Login, Einladung annehmen
│  │  ├─ (agency)/             # interner Agenturbereich
│  │  │  ├─ projects/
│  │  │  ├─ clients/
│  │  │  ├─ team/
│  │  │  └─ activity/
│  │  ├─ (client)/             # abgeschotteter Kundenbereich
│  │  │  ├─ projects/
│  │  │  └─ approvals/
│  │  ├─ api/                  # Route Handler (Uploads, Webhooks)
│  │  └─ layout.tsx
│  ├─ features/                # Fachdomänen (Vertical Slices)
│  │  ├─ organizations/        # Orgs, Einstellungen
│  │  │  ├─ actions.ts         # Server Actions (mit Authz + Audit)
│  │  │  ├─ queries.ts         # Lesezugriffe (RLS-konform)
│  │  │  ├─ schema.ts          # Zod-Schemata
│  │  │  ├─ components/        # UI (deutsche Texte)
│  │  │  └─ __tests__/
│  │  ├─ client-companies/     # Kundenunternehmen, Ansprechpartner
│  │  ├─ memberships/          # Mitglieder, Rollen
│  │  ├─ invitations/          # Einladungen
│  │  ├─ projects/
│  │  ├─ boards/               # Boards + Spalten + WIP-Limits
│  │  ├─ tasks/                # inkl. Aufgabenmodal
│  │  ├─ labels/
│  │  ├─ comments/             # intern/extern, Erwähnungen
│  │  ├─ files/
│  │  ├─ checklists/
│  │  ├─ time-tracking/        # Aufgabenzeit + Arbeitszeit
│  │  ├─ approvals/            # Freigaben
│  │  ├─ notifications/
│  │  ├─ reports/              # Berichte/Auswertungen
│  │  ├─ activity-log/
│  │  ├─ dashboard/            # Agentur- & Kunden-Dashboard
│  │  └─ auth/
│  ├─ lib/
│  │  ├─ supabase/
│  │  │  ├─ server.ts          # User-Client (RLS, Session-Cookie)
│  │  │  ├─ service.ts         # Service-Client (nur Server, RLS-Bypass)
│  │  │  └─ middleware.ts      # Session-Refresh
│  │  ├─ authz/                # zentrales Policy-Modul
│  │  │  ├─ policies.ts        # can(user, action, resource)
│  │  │  ├─ roles.ts           # Rollen-/Rechtekonstanten (Spiegel der Matrix)
│  │  │  └─ __tests__/
│  │  ├─ files/
│  │  │  ├─ upload.ts          # Validierung: MIME, Größe, Pfad, Checksumme
│  │  │  └─ __tests__/
│  │  ├─ errors.ts             # AuthorizationError, ValidationError, ...
│  │  ├─ i18n/
│  │  │  └─ de.ts              # deutsche UI-/Fehlertexte
│  │  └─ database.types.ts     # generiert via `supabase gen types`
│  ├─ components/ui/           # shadcn/ui-Basiskomponenten
│  └─ middleware.ts            # Auth-Guard, Session-Refresh
├─ e2e/                        # Playwright
│  ├─ agency.spec.ts
│  ├─ client-isolation.spec.ts # prüft: Kunde sieht keine internen Daten
│  └─ approvals.spec.ts
├─ .github/workflows/ci.yml    # typecheck, lint, test, RLS-Tests
├─ package.json
├─ tsconfig.json               # strict: true
├─ vitest.config.ts
├─ playwright.config.ts
└─ README.md
```

## Prinzipien

- **Eine Domäne = ein Feature-Ordner** mit `actions`, `queries`, `schema`,
  `components`, `__tests__`. Änderungen bleiben lokal, gut testbar.
- **Server Actions** sind die einzige schreibende Grenze: Sie validieren
  (Zod), autorisieren (Policy-Modul), führen aus und protokollieren (Audit)
  – in dieser Reihenfolge.
- **Queries** nutzen den User-Client → RLS greift automatisch. Kein Query
  verlässt sich allein auf Anwendungsfilter.
- **`lib/authz`** ist das anwendungsseitige Spiegelbild der DB-RLS. Beide
  müssen konsistent sein; RLS bleibt die harte Grenze.
- **Deutsche Texte** ausschließlich über `lib/i18n/de.ts`; keine Strings im
  Code verstreut.
- **Keine Scheinfunktionen**: Jede ausgelieferte Komponente ist mit realer
  Server-Logik und Tests hinterlegt.

## Konfiguration & Secrets

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` – clientseitig ok.
- `SUPABASE_SERVICE_ROLE_KEY` – **nur** serverseitig, nie `NEXT_PUBLIC_*`.
- `.env.example` dokumentiert alle Variablen ohne echte Werte.
