# Übergabe-Prompt für die lokale Claude-Code-Version

> Kopiere den folgenden Block als ersten Prompt in eine lokale Claude-Code-Sitzung,
> die auf deinem Rechner läuft und Zugriff auf deine CLIs (git, npm, supabase, vercel)
> und Konten hat.

---

Du übernimmst das Deployment von **„Supevo Dashboard"** und sollst es zu Ende
konfigurieren, bis Login, Passwort-Reset und Einladungen live sauber laufen.
Du hast Zugriff auf meinen Rechner, mein GitHub, mein Vercel und mein Supabase.

## Was das ist
Ein mandantenfähiges Projektmanagementsystem (Next.js 15 App Router, TypeScript,
Tailwind, Supabase mit Row Level Security). Der Code ist fertig entwickelt und
getestet und bereits auf Vercel + Supabase Cloud deployed. Es fehlt nur noch die
Feinkonfiguration (v. a. Auth/E-Mail).

## Wo liegt was
- **GitHub:** `supevo/dashboard-supevo`, Produktions-Branch **`main`** (gesamter Code liegt auf main).
- **App (Vercel):** Projekt `dashboard-supevo-crm`, Produktions-URL **https://dashboard-supevo-crm.vercel.app**, Branch-Tracking = main.
- **Backend (Supabase Cloud, EU):** Projekt-Ref **`gfnqbjeimzkvszwovnzk`**, URL **https://gfnqbjeimzkvszwovnzk.supabase.co**.
- **Wichtige Doku im Repo:** `README.md`, `deploy/README-managed.md`, `docs/architecture/*`, `docs/security-review.md`, `deploy/combined-migrations.sql`, `deploy/seed/bootstrap-admin.sql`, `.env.example`, `src/lib/env.ts`.

## Erst orientieren
1. Repo klonen/öffnen, `README.md`, `deploy/README-managed.md` und `docs/security-review.md` lesen.
2. Env-Anforderungen in `.env.example` und `src/lib/env.ts` ansehen. Die App validiert beim Build: `NEXT_PUBLIC_SUPABASE_URL` (muss gültige URL sein), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `SUPABASE_SERVICE_ROLE_KEY` (nur serverseitig).

## Bereits erledigt (nicht neu machen, nur verifizieren)
- Datenbankschema komplett eingespielt (Migrationen 0001–0008), Storage-Bucket `files` existiert.
- Ein Admin-Auth-User existiert und wurde via `bootstrap-admin.sql` zum `super_admin` der Agentur-Organisation gemacht.
- Vercel-Deploy von `main` ist grün. `NEXT_PUBLIC_SUPABASE_URL` wurde korrigiert.
- Vercel „Deployment Protection / Vercel Authentication" ist **aus** (Seite öffentlich erreichbar – bestätigt: Login-Seite lädt im Browser).
- Supabase Auth **Site URL** wurde von `localhost` auf die Vercel-URL geändert.

## Deine Aufgaben (prüfen und einstellen)
1. **Vercel Env Vars** (Settings → Environments → Production): Alle vier korrekt, ohne Leerzeichen/Anführungszeichen. Besonders `NEXT_PUBLIC_APP_URL = https://dashboard-supevo-crm.vercel.app` (nicht `localhost`). Bei Änderung: **Redeploy**.
2. **Supabase → Authentication → URL Configuration:**
   - Site URL = `https://dashboard-supevo-crm.vercel.app`
   - Redirect URLs enthält `https://dashboard-supevo-crm.vercel.app/**` (für `/reset-password` und `/auth/callback`).
3. **Supabase → Authentication → Providers → Email:** Prüfe „Confirm email". Ist es an und **kein SMTP** eingerichtet, blockiert das den Login neu angelegter Nutzer. Entweder Bestätigungspflicht vorerst deaktivieren **oder** (besser) SMTP einrichten und Nutzer bestätigen.
4. **Bekanntes Symptom:** Nach dem Passwort-Reset landet der Nutzer auf `/app` statt auf `/reset-password`. Untersuche, ob die Recovery-Mail `redirect_to` korrekt auf `.../reset-password` setzt (nicht nur die Site-URL-Root) und ob `NEXT_PUBLIC_APP_URL` stimmt. Ziel: Reset-Link führt auf `/reset-password`, wo ein neues Passwort gesetzt wird. (Der Code baut den Redirect in `src/features/auth/actions.ts` → `requestPasswordResetAction` aus `NEXT_PUBLIC_APP_URL`.)
5. **SMTP für Produktion:** Supabase → Authentication → Emails → SMTP Settings mit echtem Anbieter (Brevo/Postmark/SES) belegen, damit Passwort-Reset & Einladungen zuverlässig per Mail rausgehen.
6. **Lokale Verifikation:** `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` – alles muss grün sein (Stand: 78 Tests grün).
7. **End-to-End-Test gegen die Live-URL:** Admin-Login; Kundenunternehmen + Projekt anlegen; Aufgabe im Kanban verschieben (WIP-Limit „Aktive Aufgabe" = 1/Person, „In Überprüfung" = 5 muss serverseitig greifen); Person einladen (Einladungslink erscheint in der App); Kunde einladen und im Kundenportal prüfen, dass **nur freigegebene, nicht-interne** Inhalte sichtbar sind (interne Kommentare/Dateien/Zeiten dürfen dort nie auftauchen).

## Empfohlen vor echtem Produktivbetrieb (siehe `docs/security-review.md`)
- **RLS-Integrationstests** gegen eine echte DB aufsetzen (z. B. `supabase start` + pgTAP/SQL in CI) – wichtigster offener Punkt.
- Strikte **CSP-Header**, **Virenscan** für Uploads.
- Der Rate-Limiter ist aktuell in-memory (pro Instanz) – bei Skalierung auf Postgres/Redis umstellen.

## Sicherheit / Secrets
- Nutze meine bereits eingeloggten CLIs (`supabase`, `vercel`) bzw. frag mich nach Zugängen.
- `SUPABASE_SERVICE_ROLE_KEY` nur serverseitig (Vercel-Env), **niemals** in Client-Code, Repo oder Logs.
- Keine Secrets committen oder ausgeben.

## Arbeitsweise
Sieh dir zuerst alles an und gib mir eine kurze **Statusübersicht** (was ist ok, was fehlt). Danach arbeite die Punkte ab, erkläre jeweils kurz was du tust, und schließe mit einem **End-to-End-Test** ab. Nenne am Ende verbleibende offene Punkte / technische Schulden.
