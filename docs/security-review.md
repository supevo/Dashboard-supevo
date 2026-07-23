# Sicherheitsbericht (Phase 9)

Vollständige Sicherheitsprüfung der Anwendung vor dem Produktivbetrieb.
Geprüft gegen die in `docs/architecture/05-security-rls.md` definierten
Anforderungen.

## Zusammenfassung

| Kategorie | Ergebnis |
|---|---|
| Mandantentrennung (RLS) | ✅ auf **allen** Tabellen aktiv und policy-geschützt |
| Serverseitige Rechteprüfung | ✅ zentrale `can()`-Funktion + `authorize()` |
| Interne Daten vor Kunden | ✅ `is_internal`/`is_client_visible` in RLS erzwungen |
| Datei-Uploads/-Downloads | ✅ nach Härtung (siehe unten) |
| XSS (Rich Text) | ✅ serverseitige Sanitisierung |
| CSRF | ✅ Server Actions + Same-Origin/SameSite |
| SQL-Injection | ✅ ausschließlich parametrisierte Zugriffe |
| Open Redirects | ✅ `safeRedirectPath` |
| Rate Limits | ✅ Upload + Auth (Supabase) · teilweise (siehe Schulden) |

## Behobene Risiken

### H-1 – Direkter Storage-Lesezugriff auf interne Dateien (hoch)
**Beschreibung:** Kundennutzer sind Mitglied der Agentur-Organisation. Die
ursprüngliche Storage-`SELECT`-Policy erlaubte Lesezugriff auf alle Objekte im
Org-Pfad. Ein Kunde hätte damit über die Storage-API **interne Dateien** direkt
abrufen können – am `is_internal`-Check der `files`-Tabelle vorbei.
**Risiko/Auswirkung:** Offenlegung interner Dateien an Kunden.
**Betroffen:** `supabase/migrations/0004_task_details.sql` (Storage-Policy),
`src/app/api/files/[fileId]/download/route.ts`.
**Behebung:** Migration `0008` ersetzt die Lese-Policy durch eine **nur für
Agenturrollen** gültige Regel. Downloads erzeugen die Signed URL nun mit dem
**Service-Client** – erst **nach** der `files`-RLS-Prüfung (die
`is_internal`/Projektzugriff erzwingt). Kunden erhalten so ausschließlich ihre
kundensichtbaren Dateien, kein Direktzugriff mehr.
**Test:** `is_internal`-Sichtbarkeit über die `files`-RLS (Integrationstest in
CI mit DB einzuplanen); Download-Route gated auf Tabellen-RLS.

### F-1 – Profil-Namen für Kolleg:innen nicht lesbar (funktional/Privacy)
**Beschreibung:** `profiles`-`SELECT` erlaubte nur das eigene Profil.
Agenturnutzer sahen dadurch keine Namen von Kolleg:innen; gleichzeitig sollen
Kunden interne Benutzerinfos nicht sehen.
**Behebung:** Migration `0008` fügt `can_view_profile()` + Policy hinzu:
Agenturrollen sehen Profile von Mitgliedern **derselben** Organisation, Kunden
weiterhin nur ihr eigenes. Erfüllt „Kunden dürfen interne Benutzerinformationen
nicht sehen".

### H-2 – Upload-Route ohne Origin-/Rate-Schutz (mittel)
**Behebung:** Same-Origin-Prüfung (Abgleich `Origin` gegen `NEXT_PUBLIC_APP_URL`)
und ein Rate-Limit (30 Uploads/Minute/Nutzer) ergänzt.
**Betroffen:** `src/app/api/files/upload/route.ts`, `src/lib/rate-limit.ts`.

## Geprüft – ohne Befund

- **Fremde Aufgaben/Projekte/interne Kommentare/Dateien:** RLS-Policies filtern
  über `can_access_project` / `can_see_internal`; interne Datensätze für Kunden
  unsichtbar.
- **Manipulierte Org-/Kundenkennungen:** Tenant-Scope wird aus `auth.uid()`
  abgeleitet (`current_user_org_ids`, `current_user_client_company_ids`), nie aus
  Client-Eingaben; untergeschobene IDs greifen ins Leere.
- **Dateinamen/-größen/-typen:** serverseitige Validierung (Magic-Type über
  MIME-Allowlist, Größenlimit), bereinigte Namen, serverseitig erzeugter Pfad.
- **Rich-Text:** `sanitize-html`-Allowlist; kein `script`/`on*`/`javascript:`.
- **CSRF:** Next.js Server Actions (Origin-Prüfung), Cookies `SameSite=Lax`;
  Custom-Upload-Route zusätzlich Origin-geprüft.
- **SQLi:** kein String-konkateniertes SQL; Supabase-Client + RPC mit typisierten
  Parametern.
- **Open Redirects:** `safeRedirectPath` lässt nur interne relative Pfade zu.
- **Session/Passwort-Reset/Einladungen:** Supabase-Auth (kurzlebige JWT,
  serverseitige Prüfung in Middleware); Reset ohne User-Enumeration; Einladungen
  nur als Hash, mit Ablauf und Einmalgebrauch.
- **Fehlermeldungen/Logging:** generische deutsche Meldungen; keine Secrets/
  Tokens im Log.
- **Env:** `SUPABASE_SERVICE_ROLE_KEY` nur serverseitig; Zugriff im Browser wirft.
- **Audit:** `activity_log` append-only (kein UPDATE/DELETE-Policy).

## Verbleibende Risiken / technische Schulden

| # | Punkt | Bewertung |
|---|---|---|
| S-1 | **RLS-Integrationstests** gegen echte DB fehlen (bisher Policy-/Logik-Unit-Tests). | Vor Go-Live in CI mit `supabase start` ergänzen (höchste Priorität). |
| S-2 | **Virenscan** für Uploads nicht implementiert. | ClamAV via Job/Edge Function nachrüsten. |
| S-3 | **Rate-Limiter** ist in-memory (pro Instanz). | Bei Mehr-Instanz-Betrieb auf Postgres/Redis umstellen. |
| S-4 | **Storage-Cleanup** gelöschter Dateien (Soft-Delete-Objekte) | Aufräum-Job einplanen. |
| S-5 | `organizations.settings` (jsonb) für Org-Mitglieder lesbar. | Falls sensible Config: in separate, nur-Admin-lesbare Tabelle auslagern. |
| S-6 | **CSP-Header** noch nicht strikt (nonce-basiert). | Vor Go-Live strikte CSP setzen. |
| S-7 | E-Mail-Versand (Einladungen/Benachrichtigungen) noch nicht aktiv. | Provider anbinden. |

## Empfehlungen vor dem Produktivbetrieb

1. **RLS-Integrationstests** in CI aufsetzen (S-1) – der wichtigste Nachweis der
   Mandanten-/Sichtbarkeitsgrenzen.
2. **Strikte CSP** + Security-Header-Review (S-6).
3. **Virenscan** für Uploads (S-2).
4. **Verteilter Rate-Limiter** falls skaliert (S-3).
5. **Backups & Monitoring** des selbst gehosteten Supabase-Stacks;
   DSGVO-Prozesse (Auskunft/Löschung, AV-Vertrag) finalisieren.
6. **Penetrationstest** der Kundenportal-Grenze mit echten Konten.

## Teststand

Automatisierte Tests: **78 grün** (Rollen/Policy, Redirect, Sanitisierung/XSS,
Upload-Validierung, WIP-Limits, Zeit/Überlappung, Freigabe-Regeln, Rate-Limit).
Typecheck, Lint und Build fehlerfrei.
