# Entwicklungsphasen

Strikt phasenweise. Nach jeder Phase: Typprüfung, Linting, Tests, Build.
Jede Phase: **Ziel · Funktionen · Abhängigkeiten · Akzeptanzkriterien · Tests ·
Risiken.**

---

## Phase 0 – Architektur (dieses Paket) ✅
**Ziel:** Architektur, Datenmodell, Rollenmatrix, Sicherheits-, Seiten- und
Phasenkonzept – **kein Code**. **Akzeptanz:** Freigabe durch Auftraggeber.

## Phase 1 – Technisches Fundament
- **Ziel:** Lauffähiges, sicheres Grundgerüst mit Auth.
- **Funktionen:** Next.js + TS strict + Tailwind + shadcn/ui; Supabase-Anbindung
  (User-/Service-Client); `.env.example`; Login/Logout; Registrierung **nur per
  Einladung**; Passwort-Reset; Session/Middleware; geschützte Routen;
  rollenbasierte Weiterleitung; Agentur-/Kunden-Layout; Fehler- & 403-Seite;
  Logging; erste Migration (organizations, profiles, memberships) + RLS-Basis.
- **Abhängigkeiten:** keine.
- **Akzeptanz:** Anmeldung/Abmeldung funktioniert; ohne Einladung keine
  Registrierung; geschützte Routen leiten unauthentifiziert um; Service-Key nie
  im Browser; Build/Typecheck/Lint grün.
- **Tests:** Auth-Flows, Guard/Redirect, „keine Registrierung ohne Einladung",
  RLS Tenant-Isolation.
- **Risiken:** Fehlkonfiguration Auth-Cookies; Service-Key-Leak → Review-Gate.

## Phase 2 – Organisationen, Kunden & Rollen
- **Ziel:** Vollständige Org-/Kunden-/Rollenverwaltung + zentrale Autorisierung.
- **Funktionen:** Org anlegen/bearbeiten; Nutzer einladen; Rollen
  vergeben/ändern; Nutzer deaktivieren; Kundenunternehmen anlegen;
  Ansprechpartner zuordnen; Kundennutzer einladen; Mitgliedschaften anzeigen;
  Einladungen widerrufen/erneut senden; zentrale `can()`-Funktion; RLS je
  Tabelle; Admin-Oberfläche; Aktivitätsprotokoll.
- **Abhängigkeiten:** Phase 1.
- **Akzeptanz:** Nutzer in mehreren Orgs mit unterschiedlichen Rollen; nur
  Admins ändern Rollen; niemand erhöht eigene Rechte; `super_admin` nicht über
  UI vergebbar; Kunden sehen nur eigenes Kundenunternehmen.
- **Tests:** Zugriff auf fremde Org, unerlaubte Rollenänderung, Kunde↔Kunde,
  abgelaufene Einladung, deaktivierter Nutzer, Mehrfach-Org-Nutzer.
- **Risiken:** Rechteausweitung; inkonsistente Rollenprüfungen → nur zentrale
  Funktion verwenden.

## Phase 3 – Projekte & Kanban
- **Ziel:** Projekte, Boards, Spalten, Aufgaben, Drag & Drop mit
  serverseitigen WIP-Limits.
- **Funktionen:** Projekte/Boards/Spalten (Standard: Warteschlange, Aktive
  Aufgabe, In Überprüfung, Fertig); Spalten umbenennen/sortieren; WIP-Limits
  (Aktive = 1/Mitarbeiter, konfigurierbar; Überprüfung = 5 gesamt); Aufgaben
  mit allen Feldern; Filter (Verantwortlicher/Label/Priorität/Fälligkeit),
  Titelsuche, überfällig/blockiert; optimistische Aktualisierung.
- **Abhängigkeiten:** Phase 2.
- **Akzeptanz:** Limits serverseitig erzwungen; unerlaubte Verschiebung
  abgelehnt mit klarer Meldung; gleichzeitige Änderungen ohne Datenverlust
  (lock_version); Kunde kann Board nicht intern verschieben.
- **Tests:** Spaltenlimit, Limit/Mitarbeiter, unerlaubte Verschiebung,
  Kundenzugriff, gleichzeitige Änderungen, Sortierung, Archivierung.
- **Risiken:** Race Conditions bei WIP → transaktionale Prüfung + Trigger.

## Phase 4 – Aufgabenmodal, Kommentare, Dateien, Checklisten
- **Ziel:** Vollständige Aufgaben-Detailansicht.
- **Funktionen:** Rich-Text-Beschreibung; interne/externe Kommentare;
  Erwähnungen + Benachrichtigung; Kommentar bearbeiten/löschen (berechtigt);
  Datei-Upload (Auswahl + Drag&Drop), konfigurierbare Typen/Größe, Vorschau
  (Bild/Video/PDF), Signed-URL-Download; Checklisten + Einträge + Fortschritt;
  Aktivitätsverlauf.
- **Abhängigkeiten:** Phase 3.
- **Akzeptanz:** Kunden sehen nie interne Kommentare/Dateien; Uploads validiert
  (Typ/Größe/Pfad/Recht); Downloads nur über geschützten Prozess; Rich Text
  sanitisiert (kein XSS).
- **Tests:** interne/externe Sichtbarkeit, Uploadberechtigung, Dateizugriff,
  Kommentarrechte, XSS im Rich Text.
- **Risiken:** XSS über Rich Text; unsichere Downloads → Sanitizing + Signed URLs.

## Phase 5 – Labels
- **Ziel:** Organisationsweite Labels mit Kundensichtbarkeit.
- **Funktionen:** Label CRUD; Zuweisen/Entfernen; mehrere je Aufgabe;
  Labelverwaltung in Einstellungen; Filter im Kanban; farbige Karten; Suche;
  Kontrast/A11y.
- **Abhängigkeiten:** Phase 3 (Aufgaben).
- **Akzeptanz:** Namen je Org eindeutig; Löschen löscht keine Aufgaben;
  deaktivierte Labels bleiben sichtbar, nicht neu vergebbar; Kunden sehen nur
  freigegebene Labels.
- **Tests:** org-übergreifende Trennung, doppelte Namen, Kundenrechte.
- **Risiken:** gering.

## Phase 6 – Zeiterfassung
- **Ziel:** Arbeitszeit + Aufgabenzeit.
- **Funktionen:** Ein-/Ausstempeln, Pausen; Aufgaben-Timer start/stop/wechseln;
  manuelle Einträge CRUD; genau ein laufender Timer/eine Sitzung; Auswertungen
  (heute/Woche/Aufgabe/Projekt/Kunde/Mitarbeiter, abrechenbar); UTC-Speicherung,
  Anzeige Europe/Berlin.
- **Abhängigkeiten:** Phase 3.
- **Akzeptanz:** keine unbemerkten Überlappungen; Timerwechsel stoppt alten;
  Fremdkorrektur nur Admin + Grund im Protokoll; Kunden sehen keine internen
  Zeiten.
- **Tests:** Pausen, Überlappung, laufende Timer, Rechte, Zeitzonen.
- **Risiken:** Zeitzonen-/Überlappungsfehler → Exclusion-Constraint + Tests.

## Phase 7 – Kundenportal & Freigaben
- **Ziel:** Abgeschottetes Kundenportal + Freigabeprozess.
- **Funktionen:** vereinfachte Kundenansichten; Aufgabe einreichen; Kommentar/
  Datei/Feedback; Freigabe erteilen/ablehnen/Änderungen anfordern (Kommentar
  Pflicht); Auto-Move in konfigurierbare Spalte; Protokollierung.
- **Abhängigkeiten:** Phasen 3–6.
- **Akzeptanz:** Kunde erreicht interne Inhalte auch über direkte URLs/API/
  manipulierte IDs nicht.
- **Tests:** gezielte Angriffe auf interne Inhalte (URL, ID, API).
- **Risiken:** Datenleck interner Inhalte → RLS-Penetrationstests.

## Phase 8 – Dashboards & Benachrichtigungen
- **Ziel:** Agentur-/Kunden-Dashboard + In-App-Benachrichtigungen.
- **Funktionen:** Dashboard-Kacheln laut Spezifikation; Benachrichtigungstypen;
  gelesen/löschen/filtern, Deep-Links; Dedup; keine Selbst-Benachrichtigung;
  technische Basis für spätere E-Mails.
- **Abhängigkeiten:** Phasen 3–7.
- **Akzeptanz:** keine Duplikate; korrekte Zielverlinkung; Kunden-Dashboard ohne
  interne Daten.
- **Tests:** Dedup, Sichtbarkeit, Deep-Links, „keine Selbstbenachrichtigung".
- **Risiken:** Benachrichtigungsfluten → Aggregation/Dedup.

## Phase 9 – Abschließender Sicherheitscheck
- **Ziel:** Vollständige Sicherheitsprüfung + Behebung kritischer/hoher Risiken.
- **Funktionen/Prüfumfang:** Mandantentrennung, RLS, serverseitige Prüfungen,
  direkter Zugriff auf fremde/interne Objekte, manipulierte IDs, Uploads/
  Downloads/Namen/Größen/Typen, Rich Text/XSS, CSRF, SQLi, Open Redirects,
  Session, Passwort-Reset, Einladungslinks, Rate Limits, Fehlermeldungen,
  Logging, Env-Variablen.
- **Abhängigkeiten:** alle.
- **Akzeptanz:** Bericht mit behobenen/verbleibenden Risiken, technischen
  Schulden, fehlenden Tests, Go-Live-Empfehlungen; kritische/hohe Risiken behoben.
- **Tests:** vollständige Suite grün + gezielte Sicherheitstests.
- **Risiken:** Restrisiken dokumentiert.

## Phase 10 (später) – DSGVO & Betrieb
Auskunft/Löschung, Aufbewahrung, Monitoring, Backups, Virenscan, E-Mail-Versand.

---

## Kritische Einordnung – was v1 NICHT braucht

Ich empfehle, folgende Punkte **bewusst zurückzustellen**, um schneller ein
solides, sicheres MVP zu erreichen (Modell bleibt erweiterbar):

1. **Mehrere Agenturen / White-Label** – Modell vorbereitet, aber v1 mit einer
   Agentur betreiben. Spart erheblichen Test-/UI-Aufwand.
2. **Echtzeit-Kollaboration (Live-Cursor/Präsenz)** – für v1 genügt sichere
   Nebenläufigkeit (lock_version + WIP-Transaktion) und Neuladen. Supabase
   Realtime als spätere Ausbaustufe.
3. **Video-Vorschau** – aufwendig (Transcoding/Player). v1: Bild + PDF-Vorschau,
   Video als Download.
4. **Team­auslastungs-Analytics** – als einfache Kennzahl statt komplexem
   Kapazitätsmodell starten.
5. **E-Mail-Benachrichtigungen** – nur technische Basis; Versand später.
6. **Datei-Versionierung** – v1: Ersetzen ohne Versionshistorie.
7. **Abrechnung/Rechnungen** – nicht im Umfang; Zeiterfassung liefert nur
   abrechenbare Stunden als Report.
8. **Virenscan** – als technische Schuld führen, bis Betrieb steht.

## Offene Entscheidungspunkte

| # | Punkt | Empfehlung |
|---|---|---|
| O1 | Deployment: Managed Supabase EU vs. Self-Hosting Plesk | Managed Supabase EU. |
| O2 | Interne Zeiteinträge: alle Agenturrollen vs. nur eigene | Mitarbeiter/Freelancer nur eigene. |
| O3 | „Arbeitszeit"-Modul (Stempeluhr) in v1 nötig? | Falls keine Arbeitszeitpflicht: auf Aufgabenzeit fokussieren, Arbeitszeit optional. |
| O4 | Auto-Move-Ziel nach Freigabe je Projekt/global konfigurierbar | je Projekt, mit sinnvollem Default. |
| O5 | Gäste: nur Freigabe-Link oder breiterer Lesezugriff? | nur konkretes geteiltes Objekt, zeitlich begrenzt. |

## Technische Schulden (laufend)

- Virenscan für Uploads (bis umgesetzt).
- Volltextsuche über Aufgaben/Dateien.
- Feingranulare Feldberechtigungen (z. B. Budget nur PM).
- E-Mail-Versand, Datei-Versionierung.

## Definition of Done je Phase

1. Migrationen + RLS getestet.
2. Server Actions mit Zod-Validierung, `can()`-Autorisierung, Audit.
3. Deutsche UI-Texte, verständliche Fehlermeldungen.
4. Unit-, RLS- und (Kernflows) E2E-Tests grün.
5. `tsc --noEmit`, ESLint, Tests, Build grün.
6. Offene Punkte/Schulden dokumentiert.
