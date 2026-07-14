# Sicherheitskonzept

## 1. Verteidigung in der Tiefe

Berechtigungen werden an **zwei** Stellen erzwungen:

1. **Datenbank (RLS)** – harte, nicht umgehbare Grenze.
2. **Anwendung (Server Actions / Route Handler)** – zentrales Policy-Modul
   validiert (Zod), autorisiert (`can(...)`), führt aus, protokolliert.

Das Frontend prüft nur zur UI-Steuerung, **niemals** als Sicherheitsgrenze.

## 2. RLS-Hilfsfunktionen (`SECURITY DEFINER`, `STABLE`, fixierter `search_path`)

```sql
is_super_admin() -> boolean
is_agency_staff() -> boolean                    -- agency_admin|project_manager|employee|freelancer
current_user_org_ids() -> setof uuid            -- aktive Memberships
current_user_client_company_ids() -> setof uuid -- über client_contacts
can_access_project(p_project_id uuid) -> boolean
can_manage_project(p_project_id uuid) -> boolean -- lead/agency_admin/super_admin
can_see_internal(p_project_id uuid) -> boolean  -- true nur Agenturrollen; immer false für client/guest
```

Alle Funktionen leiten die Identität aus `auth.uid()` ab. Kein Wert stammt aus
Client-Eingaben.

## 3. Schutz vor manipulierten Organisations-/Kundenkennungen

**Grundregel:** `organization_id` und `client_company_id` werden **niemals** aus
dem Request übernommen, um Zugriff zu gewähren. Ablauf:

- Beim Schreiben setzt die Server Action die `organization_id` selbst aus der
  Session/Membership – ein mitgesendeter Wert wird ignoriert bzw. gegen die
  erlaubten Werte geprüft (`with check organization_id in (select
  current_user_org_ids())`).
- Beim Lesen filtert RLS auf `current_user_org_ids()` bzw.
  `current_user_client_company_ids()`. Ein untergeschobenes fremdes ID greift
  ins Leere (0 Zeilen), kein Fehler mit Datenpreisgabe.
- IDOR-Schutz: ausschließlich User-Client (RLS); Service-Key nie im Client.

## 4. Policy-Muster je Tabelle (Beispiel `comments`)

```sql
alter table comments enable row level security;

create policy comments_select on comments for select using (
  can_access_project(project_id)
  and (is_internal = false or can_see_internal(project_id))
  and deleted_at is null
);

create policy comments_insert on comments for insert with check (
  can_access_project(project_id)
  and author_id = auth.uid()
  and organization_id in (select current_user_org_ids())
  and (is_internal = false or can_see_internal(project_id))
);

-- update/delete: nur Autor oder can_manage_project(project_id)
```

Analog für tasks, files, notes, time_entries, checklists, approvals. Der
Ausdruck `is_internal = false OR can_see_internal(project_id)` ist die
technische Umsetzung von „Kunden sehen interne Daten nie".

## 5. Serverseitige Rechteprüfung

Jede Server Action folgt strikt:

```
1. Authentifizierung prüfen (Session vorhanden?)
2. Eingaben validieren (Zod-Schema, Feld-Allowlist -> kein Mass Assignment)
3. Autorisieren: can(user, action, resource) — zentrale Funktion
4. Ausführen (User-Client -> RLS greift zusätzlich)
5. Aktivitätsprotokoll schreiben
6. Verständliche deutsche Antwort/Fehlermeldung
```

## 6. WIP-Limits & gleichzeitige Änderungen (serverseitig, nicht optisch)

- **WIP-Limit** wird beim Verschieben in einer DB-Transaktion geprüft: Zähle
  Aufgaben in der Zielspalte (`SELECT ... FOR UPDATE` auf Spalten-/Boardzeile
  zur Serialisierung), vergleiche mit `wip_limit` bzw. `wip_limit_per_user`
  (Zählung je Assignee). Überschreitung → Verschiebung abgelehnt, klare
  deutsche Fehlermeldung. Zusätzlich als DB-Trigger-Funktion, damit auch direkte
  DB-Zugriffe geschützt sind.
- **Lost-Update-Schutz:** `tasks.lock_version` wird bei jedem Update geprüft
  (`WHERE id = ? AND lock_version = ?`, danach `+1`). Konflikt → 409-artige
  Meldung, Client lädt neu (optimistische Aktualisierung mit Fehlerkorrektur).

## 7. Sichere Datei-Uploads/-Downloads

1. **Kein öffentlicher Bucket.** Download nur über kurzlebige Signed URLs nach
   serverseitiger Rechteprüfung.
2. **Speicherpfad serverseitig erzeugt:**
   `org/{organization_id}/project/{project_id}/task/{task_id}/{uuid}_{sanitized}`.
   Nie vom Client übernommen (Path-Traversal-Schutz).
3. **MIME-Allowlist** je Kontext, geprüft über **Magic Bytes**, nicht nur
   Endung. Konfigurierbar über `organizations.settings`.
4. **Größenlimit** serverseitig **und** per Storage-Policy.
5. **Berechtigung** vor Upload/Download über Policy-Modul.
6. **Dateiname bereinigt**; Originalname nur als Anzeigefeld.
7. **Checksumme (SHA-256)** für Integrität/Dedup.
8. `is_internal` → interne Dateien für `client`/`guest` per RLS + Storage-Policy
   nicht abrufbar.
9. **Virenscan** (ClamAV via Job/Edge Function) als Ausbaustufe → technische
   Schuld bis umgesetzt.

Storage-RLS auf `storage.objects` prüft Pfadpräfix gegen
`current_user_org_ids()` + Projektzugehörigkeit.

## 8. Cross-Site-Scripting (XSS)

- Rich-Text (Beschreibung, Kommentare) wird **serverseitig sanitisiert**
  (HTML-Allowlist, z. B. `sanitize-html`) **vor** dem Speichern und beim Rendern
  (DOMPurify). Nur erlaubte Tags/Attribute; keine `script`, `on*`, `javascript:`.
- React escaped standardmäßig; `dangerouslySetInnerHTML` nur mit sanitisiertem
  Inhalt.
- Content-Security-Policy-Header (strikt, keine Inline-Skripte außer per Nonce).

## 9. Cross-Site-Request-Forgery (CSRF)

- Next.js Server Actions prüfen Origin/Same-Site automatisch; Cookies
  `SameSite=Lax`, `HttpOnly`, `Secure`.
- Für Custom Route Handler (Uploads/Webhooks): Origin-Prüfung + CSRF-Token bzw.
  Signaturprüfung bei Webhooks.

## 10. Weitere Angriffsflächen

| Risiko | Gegenmaßnahme |
|---|---|
| **SQL-Injection** | Ausschließlich parametrisierte Queries via Supabase-Client; kein String-Concat; RPC mit typisierten Parametern. |
| **Open Redirects** | Redirect-Ziele gegen Allowlist relativer Pfade prüfen; keine offenen `next`-Parameter. |
| **Rate Limits** | Login, Passwort-Reset, Einladungsannahme, Upload, Kommentare pro IP/Nutzer begrenzt (Middleware + Zähler in Postgres/Upstash). Klare Fehlermeldung bei Überschreitung. |
| **Session** | Supabase Auth (kurzlebige JWT + Refresh), serverseitige Prüfung in Middleware; Logout invalidiert. |
| **Passwort-Reset** | Einmal-Token mit Ablauf, nur Hash gespeichert, kein User-Enumeration-Leak (immer generische Antwort). |
| **Einladungslinks** | Nur Token-Hash, Ablauf, Einmalgebrauch, an E-Mail gebunden; Registrierung nur mit gültiger Einladung. |
| **Rechteausweitung** | Rollenänderung nur durch erlaubte Rollen; Selbst-Höherstufung verboten; `super_admin` nie über UI. |
| **Mass Assignment** | Zod-Schemata mit expliziter Feld-Allowlist. |
| **Audit-Manipulation** | `activity_log` append-only (kein UPDATE/DELETE-Policy). |
| **Secret-Leak** | `SUPABASE_SERVICE_ROLE_KEY` nur serverseitig, nie `NEXT_PUBLIC_*`; `.env` nicht committen. |

## 11. Protokollierung & Fehlermeldungen

- **Audit** (`activity_log`): create/update/delete, Statuswechsel,
  Assignee-/Fälligkeitsänderung, Rollenänderung, Freigabeentscheidung,
  Upload/Download, Login/Logout, Einladung, Zeitkorrektur.
- **Keine sensiblen Daten** in Logs (keine Passwörter, Tokens, Dateiinhalte).
- Zentrale Fehlerklassen (`AuthorizationError`, `ValidationError`,
  `NotFoundError`, `ConflictError`) → **deutsche**, generische Nutzermeldungen;
  technische Details nur ins Server-Log/Audit.

## 12. DSGVO

EU-Datenhaltung; Auskunft/Löschung als eigene Phase; AV-Vertrag;
Aufbewahrungsfristen für Audit/Zeiten; Datensparsamkeit.
