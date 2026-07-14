# Seiten- und Routenstruktur

Next.js App Router. Route-Gruppen trennen öffentliche, Agentur- und
Kundenbereiche. Nach Login **rollenbasierte Weiterleitung**: Agenturrollen →
`/app`, `client`/`guest` → `/portal`.

## Öffentlich / Auth – `(auth)`

| Route | Seite | Zugriff |
|---|---|---|
| `/login` | Anmeldung | öffentlich |
| `/invite/[token]` | Einladung annehmen + Registrierung | nur mit gültigem Token |
| `/forgot-password` | Passwort-Reset anfordern | öffentlich |
| `/reset-password/[token]` | Neues Passwort setzen | nur mit gültigem Token |
| `/auth/callback` | Supabase-Auth-Callback | System |

> **Keine offene Registrierung.** Konten entstehen ausschließlich über
> `/invite/[token]`.

## Agenturbereich – `(agency)` unter `/app`

| Route | Seite |
|---|---|
| `/app` | Agentur-Dashboard (aktive/überfällige Aufgaben, Timer, Freigaben, Aktivität, Auslastung) |
| `/app/projects` | Projektübersicht |
| `/app/projects/[projectId]` | Projektdetail |
| `/app/projects/[projectId]/board/[boardId]` | Kanban-Board (Drag & Drop, WIP-Limits) |
| `/app/projects/[projectId]/tasks` | Aufgabenliste (Filter/Suche) |
| `/app/projects/[projectId]/tasks/[taskId]` | Aufgabenmodal (auch als Deep-Link) |
| `/app/projects/[projectId]/files` | Projektdateien |
| `/app/projects/[projectId]/approvals` | Freigaben des Projekts |
| `/app/time` | Zeiterfassung: Arbeitszeit + Aufgabenzeit, meine Zeiten heute/Woche |
| `/app/clients` | Kundenunternehmen |
| `/app/clients/[clientCompanyId]` | Kundendetail + Ansprechpartner |
| `/app/team` | Mitgliederverwaltung (Rollen, Status) |
| `/app/invitations` | Einladungen (senden, widerrufen, erneut senden) |
| `/app/reports` | Berichte (Zeit nach Projekt/Kunde/Mitarbeiter, abrechenbar) |
| `/app/activity` | Aktivitätsprotokoll (Org/Projekt) |
| `/app/settings` | Organisationseinstellungen (Upload-Policy, Labels, Automatik) |
| `/app/settings/labels` | Labelverwaltung |
| `/app/profile` | Eigenes Profil |
| `/app/notifications` | Benachrichtigungen |

## Kundenportal – `(client)` unter `/portal`

Bewusst einfacher als die Agenturansicht.

| Route | Seite |
|---|---|
| `/portal` | Kunden-Dashboard (offene/laufende Aufgaben, zur Freigabe, neue Kommentare/Dateien, Projektfortschritt) |
| `/portal/projects` | Freigegebene Projekte des eigenen Kundenunternehmens |
| `/portal/projects/[projectId]` | Projekt (nur kundensichtbare Inhalte) |
| `/portal/projects/[projectId]/tasks/[taskId]` | Aufgabe (nur externe Kommentare/Dateien) |
| `/portal/approvals` | Offene Freigaben (freigeben / Änderungen anfordern) |
| `/portal/notifications` | Eigene Benachrichtigungen |
| `/portal/profile` | Eigenes Profil |

## Gemeinsame Fehler-/Statusseiten

| Route/Datei | Zweck |
|---|---|
| `app/not-found.tsx` | 404 – Ressource nicht gefunden (deutsch) |
| `app/error.tsx` | 500 – unerwarteter Fehler (deutsch, ohne Interna) |
| `/403` bzw. `forbidden.tsx` | Fehlende Berechtigung (deutsch) |
| `app/unauthorized` | Nicht angemeldet → Weiterleitung zu `/login` |

## API-Routen – `app/api`

| Route | Zweck |
|---|---|
| `POST /api/files/upload` | Sicherer Upload (Validierung, Pfaderzeugung) |
| `GET /api/files/[fileId]/download` | Signed-URL-Erzeugung nach Rechteprüfung |
| `POST /api/webhooks/*` | (später) externe Ereignisse, signaturgeprüft |

## Middleware

`src/middleware.ts`: Session-Refresh, Auth-Guard (geschützte Bereiche),
rollenbasierte Weiterleitung (`/app` vs. `/portal`), Rate-Limit-Hooks für
sensible Routen.
