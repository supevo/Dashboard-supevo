# Anforderungsanalyse

## 1. Ausgangslage und Ziel

Eine deutsche Marketingagentur benötigt eine zentrale Plattform, die

- **intern** von der Agentur zur Projektabwicklung genutzt wird und
- **extern** jedem Kunden einen abgeschotteten, eigenen Kundenbereich bietet.

Kernfunktionen: Aufgabenmanagement, Kommunikation, Dateiverwaltung, Freigaben
und Zeiterfassung – strikt mandantengetrennt.

## 2. Akteure

| Akteur | Beschreibung | Organisation |
|--------|--------------|--------------|
| Plattformbetreiber | Betreibt und wartet das System | – (systemweit) |
| Agenturleitung/Admin | Verwaltet Agentur, Nutzer, Kunden, Projekte | Agentur |
| Projektleiter | Verantwortet einzelne Projekte | Agentur |
| Mitarbeiter | Bearbeitet Aufgaben, erfasst Zeit | Agentur |
| Freelancer | Externer Auftragnehmer, eingeschränkt | Agentur (extern) |
| Kunde | Auftraggeber, sieht nur Kundensicht | Kunde |
| Gast | Sehr eingeschränkter, temporärer Zugriff | – |

Rollen im Detail: siehe `04-role-matrix.md`.

## 3. Funktionale Anforderungen

### 3.1 Mandantenfähigkeit (F-MT)
- **F-MT-1** Jeder Datensatz ist eindeutig einer Organisation zugeordnet.
- **F-MT-2** Nutzer sehen/bearbeiten ausschließlich Daten, für die sie
  berechtigt sind.
- **F-MT-3** Agenturmitarbeiter arbeiten organisationsübergreifend über
  Projektzuweisungen; Kunden sind auf ihre Organisation beschränkt.

### 3.2 Aufgabenmanagement (F-TASK)
- Projekte mit Aufgaben, Unteraufgaben, Status, Zuständigen, Fälligkeiten,
  Prioritäten, Labels.
- Kanban- und Listenansicht.
- Aufgaben können intern oder kundensichtbar sein.

### 3.3 Kommunikation (F-COMM)
- Kommentare an Aufgaben und Projekten.
- **Interne Kommentare** sind für Kunden/Gäste niemals sichtbar.
- @-Erwähnungen und Benachrichtigungen.

### 3.4 Dateien (F-FILE)
- Upload/Download an Projekten, Aufgaben, Freigaben.
- Interne Dateien sind für Kunden/Gäste niemals sichtbar.
- Sichere Uploadregeln (Typ, Größe, Berechtigung, Pfad) – siehe `05-security-rls.md`.
- Versionierung (mindestens Ersetzen mit Historie) als spätere Ausbaustufe.

### 3.5 Freigaben (F-APPR)
- Agentur stellt Artefakte (Datei/Aufgabe) zur Freigabe bereit.
- Kunde erteilt Freigabe oder lehnt mit Begründung ab.
- Statushistorie, Benachrichtigungen, optional Gast-Freigabe per Link.

### 3.6 Zeiterfassung (F-TIME)
- Mitarbeiter/Freelancer erfassen Zeit je Aufgabe/Projekt.
- Grundsätzlich intern; einzelne Einträge als abrechenbar/kundensichtbar
  markierbar.
- Auswertungen je Projekt/Nutzer/Zeitraum.

### 3.7 Aktivitätsprotokoll (F-AUDIT)
- Alle kritischen Aktionen (Erstellen/Ändern/Löschen, Rechteänderung,
  Freigaben, Logins) werden protokolliert (append-only).

## 4. Nichtfunktionale Anforderungen

| Kürzel | Anforderung |
|--------|-------------|
| NF-SEC-1 | Berechtigungen serverseitig **und** per RLS geprüft. |
| NF-SEC-2 | Keine Platzhalter-/Scheinfunktionen – nur real funktionierende Logik. |
| NF-SEC-3 | Sichere Datei-Uploads (Typ, Größe, Pfad, Berechtigung). |
| NF-QUAL-1 | Wartbarer, modularer, streng typisierter Code (TypeScript strict). |
| NF-QUAL-2 | Tests für jede wichtige Funktion (Unit, RLS, E2E). |
| NF-I18N-1 | UI-Texte Deutsch; Code/DB-Bezeichner Englisch. |
| NF-DSGVO-1 | EU-Datenhaltung, Auskunft/Löschung, AV-Vertrag, Aufbewahrungsfristen. |
| NF-UX-1 | Verständliche, deutschsprachige Fehlermeldungen. |

## 5. Kernkonzepte des Domänenmodells

- **Organization** – Mandant (Agentur). White-Label-fähig.
- **Membership** – Verknüpft User ↔ Organization mit einer globalen Rolle. Ein
  Nutzer kann mehreren Organisationen mit je eigener Rolle angehören.
- **ClientCompany** – Kundenunternehmen innerhalb einer Organisation.
- **ClientContact** – Ordnet Kundennutzer einem Kundenunternehmen zu.
- **Project** – Gehört zu einem Kundenunternehmen, wird von der Agentur
  betreut. Zentrale Zugriffseinheit.
- **ProjectMember** – Verknüpft User ↔ Project mit projektbezogener Rolle.
  Entscheidet, wer welches Projekt sieht.
- **is_internal** – Sichtbarkeitsgrenze zwischen Agentur und Kunde auf
  Datensatzebene (Kommentare, Dateien, Notizen, Zeiteinträge, Labels).

## 6. Abgrenzung (aktuell nicht im Umfang)

- Rechnungsstellung / Buchhaltung.
- Mehrere unabhängige Agenturen (White-Label) – Modell ist aber vorbereitet.
- Native Mobile-Apps (zunächst responsives Web).
