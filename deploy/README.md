# Deployment – Self-Hosting auf Plesk

Diese Anleitung bringt das Supevo Dashboard auf einem Plesk-Server live:
selbst gehostetes **Supabase** (Postgres, Auth, Storage, API-Gateway) plus die
**Next.js-App** als Container, beide hinter dem Plesk-Reverse-Proxy mit HTTPS.

```
                    ┌─────────── Plesk-Server ───────────┐
 Browser ──HTTPS──▶ │  Reverse Proxy (Let's Encrypt)     │
                    │   app.supevo.de  ─▶ Next.js :3001   │
                    │   api.supevo.de  ─▶ Supabase Kong :8000
                    │                                     │
                    │  Docker: Supabase-Stack + App-Container
                    └─────────────────────────────────────┘
```

> **Empfohlener, schlankerer Weg → siehe [`README-managed.md`](./README-managed.md):**
> Managed Supabase (EU/Frankfurt) + Vercel für die App. Kein eigener Server,
> kein Ops-Aufwand, DSGVO über AV-Vertrag. Der Code ist identisch. Diese
> Plesk-Anleitung ist nur nötig, wenn du **alles auf eigener Hardware** betreiben
> musst.

---

## Voraussetzungen

- Plesk-Server mit **Docker** (Plesk-Erweiterung „Docker") und SSH-Zugang.
- Eine Domain mit zwei Subdomains, z. B. `app.supevo.de` und `api.supevo.de`.
- `git`, `docker`, `docker compose` und `psql` auf dem Server.

---

## Schritt 1 – DNS

Lege zwei A-Records an, die auf die Server-IP zeigen:

- `app.supevo.de` → App
- `api.supevo.de` → Supabase-Gateway

---

## Schritt 2 – Supabase selbst hosten

Wir nutzen den offiziellen Supabase-Docker-Stack (kein Nachbau, damit Updates
sauber bleiben):

```bash
cd /opt
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

Bearbeite `/opt/supabase/docker/.env` – **alle Demo-Werte ersetzen**:

- `POSTGRES_PASSWORD` – starkes Passwort.
- `JWT_SECRET` – zufällig, mind. 32 Zeichen.
- `ANON_KEY` und `SERVICE_ROLE_KEY` – JWTs, die mit `JWT_SECRET` signiert sind
  (Generator: <https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys>).
- `SITE_URL=https://app.supevo.de`
- `API_EXTERNAL_URL=https://api.supevo.de`
- `SUPABASE_PUBLIC_URL=https://api.supevo.de`
- `ADDITIONAL_REDIRECT_URLS=https://app.supevo.de/reset-password,https://app.supevo.de/auth/callback`
- **SMTP** (`SMTP_*`) – für Passwort-Reset-E-Mails erforderlich (siehe Hinweis unten).

Starten:

```bash
docker compose up -d
```

Prüfen, dass alle Container laufen (`docker compose ps`). Das Gateway (Kong)
hört auf Port `8000`, Studio erreichst du über den Kong-Pfad.

---

## Schritt 3 – Datenbankmigrationen einspielen

Die 8 Migrationen legen Tabellen, RLS-Policies, Funktionen und den Storage-
Bucket `files` an. **Erst ausführen, wenn der Supabase-Stack läuft** (die
`auth`- und `storage`-Schemata müssen existieren).

```bash
cd /opt/supevo-dashboard          # dieses Repo, siehe Schritt 5
export DATABASE_URL="postgresql://postgres:DEIN_POSTGRES_PASSWORT@localhost:5432/postgres"
./deploy/apply-migrations.sh
```

Das Skript spielt `supabase/migrations/0001..0008` in Reihenfolge ein und
bricht bei Fehlern ab.

---

## Schritt 4 – Ersten Administrator anlegen

Es gibt **keine offene Registrierung** – der erste Account wird gebootstrappt:

1. In **Supabase Studio → Authentication → Users → „Add user"** den Admin
   anlegen (E-Mail + Passwort, „Auto Confirm User" aktivieren).
2. In `deploy/seed/bootstrap-admin.sql` die Zeile `v_admin_email` auf diese
   E-Mail setzen.
3. Ausführen:

```bash
psql "$DATABASE_URL" -f deploy/seed/bootstrap-admin.sql
```

Der Nutzer ist danach `super_admin` der Agentur-Organisation. Alle weiteren
Nutzer entstehen über **Einladungen** in der App.

---

## Schritt 5 – App-Code & Umgebungsvariablen

```bash
cd /opt
git clone https://github.com/supevo/dashboard-supevo supevo-dashboard
cd supevo-dashboard
cp deploy/.env.deploy.example deploy/.env.deploy
```

`deploy/.env.deploy` befüllen:

- `NEXT_PUBLIC_SUPABASE_URL=https://api.supevo.de`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=` → `ANON_KEY` aus dem Supabase-`.env`
- `SUPABASE_SERVICE_ROLE_KEY=` → `SERVICE_ROLE_KEY` aus dem Supabase-`.env` (geheim!)
- `NEXT_PUBLIC_APP_URL=https://app.supevo.de`

---

## Schritt 6 – App bauen & starten

```bash
docker compose --env-file deploy/.env.deploy -f deploy/docker-compose.app.yml up -d --build
```

Die App läuft nun lokal auf `127.0.0.1:3001` (nur intern erreichbar).

---

## Schritt 7 – Plesk-Reverse-Proxy + HTTPS

Für **beide** Subdomains in Plesk je eine Domain/Subdomain anlegen, dann unter
**Apache & nginx Settings → Additional nginx directives** weiterleiten:

`app.supevo.de`:
```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

`api.supevo.de`:
```nginx
location / {
    proxy_pass http://127.0.0.1:8000;   # Supabase Kong
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Anschließend für beide Domains **Let's Encrypt** aktivieren (SSL/TLS
Certificates). Danach ist die App unter `https://app.supevo.de` erreichbar.

---

## Schritt 8 – Verifikation

- [ ] `https://app.supevo.de/login` lädt.
- [ ] Anmeldung mit dem Bootstrap-Admin funktioniert → Weiterleitung nach `/app`.
- [ ] Team → Person einladen erzeugt einen Einladungslink; Registrierung nur
      darüber möglich.
- [ ] Projekt anlegen, Aufgabe erstellen, im Kanban verschieben (WIP-Limit greift).
- [ ] Datei hochladen und wieder herunterladen (Signed URL).
- [ ] Kunde einladen → Kundenportal zeigt nur freigegebene, nicht-interne Inhalte.

---

## Wichtige Hinweise

- **SMTP / E-Mails:** Passwort-Reset (`/forgot-password`) versendet über Supabase
  GoTrue – dafür müssen die `SMTP_*`-Variablen im Supabase-`.env` gesetzt sein.
  Einladungen funktionieren auch ohne SMTP (der Link wird in der App angezeigt).
  In-App-Benachrichtigungen sind unabhängig davon aktiv; E-Mail-Versand für
  Benachrichtigungen ist als spätere Ausbaustufe vorgesehen.
- **Backups:** Regelmäßige Dumps der Postgres-DB und Sicherung des Storage-
  Volumes einrichten (`docker compose` Volumes).
- **Updates:** App neu bauen (`... up -d --build`) nach `git pull`. Supabase-
  Stack gemäß offizieller Doku aktualisieren. Neue DB-Migrationen mit
  `apply-migrations.sh` nachziehen.
- **Vor echtem Produktivbetrieb:** offene Punkte aus `docs/security-review.md`
  abarbeiten – v. a. RLS-Integrationstests, strikte CSP, Virenscan für Uploads.

---

## DSGVO

- Datenhaltung in DE/EU durch Self-Hosting.
- AV-Vertrag mit dem Hosting-Anbieter (Server).
- Aufbewahrungsfristen für `activity_log`/Zeiteinträge festlegen.
- Prozesse für Auskunft/Löschung (Recht auf Vergessenwerden) etablieren.
