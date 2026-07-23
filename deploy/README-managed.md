# Deployment – Managed Supabase (EU) + Vercel

Der schlanke, empfohlene Weg: **kein eigener Server**. Supabase Cloud stellt
Datenbank, Auth und Storage; Vercel hostet die Next.js-App; GitHub liefert den
Code.

```
 Browser ──HTTPS──▶ Vercel (Next.js App)  ──▶  Supabase Cloud (EU/Frankfurt)
                     app.supevo.de               Postgres + Auth + Storage + RLS
```

- **Kein Ops-Aufwand** (Backups/Updates/Skalierung/HTTPS managed).
- **DSGVO**: Supabase-Projekt in Region **EU (Frankfurt)**, AV-Vertrag (DPA) mit
  Supabase + Vercel abschließen.
- **Am Code ändert sich nichts** – es werden nur Standard-Supabase-Features
  genutzt. Ein späterer Umzug zu Self-Hosting bleibt möglich.

---

## Schritt 1 – Supabase-Projekt anlegen

1. Auf <https://supabase.com> ein Projekt erstellen, **Region: Central EU
   (Frankfurt)**.
2. Unter **Project Settings → API** notieren:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` Key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` Key → `SUPABASE_SERVICE_ROLE_KEY` (geheim!)

---

## Schritt 2 – Migrationen einspielen

Die 8 Migrationen legen Tabellen, RLS, Funktionen und den Storage-Bucket
`files` an.

**Variante A – Supabase CLI (empfohlen):**
```bash
npm install -g supabase
supabase login
supabase link --project-ref DEIN_PROJECT_REF
supabase db push        # wendet supabase/migrations/*.sql an
```

**Variante B – SQL-Editor:** Inhalt von `supabase/migrations/0001…0008`
**in dieser Reihenfolge** nacheinander im Supabase **SQL Editor** ausführen.

---

## Schritt 3 – Ersten Administrator anlegen

Es gibt keine offene Registrierung.

1. **Supabase → Authentication → Users → „Add user"**: Admin-E-Mail + Passwort
   anlegen (Auto-Confirm aktiv).
2. In `deploy/seed/bootstrap-admin.sql` die Zeile `v_admin_email` setzen.
3. Den Inhalt der Datei im **SQL Editor** ausführen (oder per `psql`).
   → Der Nutzer wird `super_admin` der Agentur-Organisation.

---

## Schritt 4 – App auf Vercel deployen

1. Auf <https://vercel.com> **„New Project"** → GitHub-Repo `supevo/dashboard-supevo`
   importieren (Framework „Next.js" wird erkannt).
2. **Environment Variables** setzen (Production **und** Preview):
   | Name | Wert |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL aus Schritt 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (**Sensitive**) |
   | `NEXT_PUBLIC_APP_URL` | die spätere App-URL (s. Schritt 5) |
   | `LOG_LEVEL` | `info` |
3. **Deploy** klicken. Vercel baut und veröffentlicht die App.

> Hinweis: `output: 'standalone'` in `next.config.mjs` stört Vercel nicht –
> Vercel nutzt seine eigene Build-Pipeline.

---

## Schritt 5 – Domain & URLs verbinden

1. In Vercel eine **eigene Domain** hinzufügen (z. B. `app.supevo.de`) oder die
   `*.vercel.app`-URL verwenden.
2. `NEXT_PUBLIC_APP_URL` in Vercel auf **genau diese URL** setzen und **neu
   deployen** (die Variable wird beim Build eingebacken).
3. In **Supabase → Authentication → URL Configuration**:
   - `Site URL` = `https://app.supevo.de`
   - `Redirect URLs` = `https://app.supevo.de/reset-password`,
     `https://app.supevo.de/auth/callback`

---

## Schritt 6 – E-Mail (SMTP) für Passwort-Reset

Passwort-Reset versendet über Supabase Auth. Der eingebaute Standardversand ist
limitiert (nur Tests). Für Produktivbetrieb unter **Authentication → Emails →
SMTP Settings** einen eigenen SMTP-Anbieter hinterlegen (z. B. Postmark,
Brevo, SES). Login und Einladungen funktionieren auch ohne SMTP (Einladungslink
wird in der App angezeigt).

---

## Schritt 7 – Verifikation

- [ ] `https://app.supevo.de/login` lädt.
- [ ] Login mit Bootstrap-Admin → Weiterleitung nach `/app`.
- [ ] Team → Einladung erzeugt Link; Registrierung nur darüber.
- [ ] Projekt/Aufgabe anlegen, im Kanban verschieben (WIP-Limit greift).
- [ ] Datei hoch- und wieder herunterladen (Signed URL).
- [ ] Kunde einladen → Portal zeigt nur freigegebene, nicht-interne Inhalte.

---

## Updates

- **App**: `git push` auf den Branch → Vercel deployt automatisch.
- **Datenbank**: neue Migrationen mit `supabase db push` nachziehen.

## Vor echtem Produktivbetrieb

Offene Punkte aus `docs/security-review.md` abarbeiten – v. a.
RLS-Integrationstests, strikte CSP, Virenscan für Uploads. Managed Supabase
übernimmt Backups; DSGVO-Prozesse (Auskunft/Löschung) dennoch etablieren.
