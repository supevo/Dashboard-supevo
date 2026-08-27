-- =============================================================================
-- Migration 0165 – Soft Skills aus der Lieblingsarbeit entfernen
--
-- Persönliche Kompetenzen (Soft Skills) sind KEINE Lieblingsarbeit. Ein früherer
-- kombinierter Editor legte jedoch auch für Soft Skills work_preferences-Zeilen
-- an – dadurch tauchten Team-, Konflikt-, Kommunikationsfähigkeit usw. sowohl in
-- der Lieblingsarbeit-Anzeige (rote Balken) als auch in der KI-Aufgabenverteilung
-- auf und doppelten sich mit der Karte "Persönliche Kompetenzen".
--
-- Diese Alt-Zeilen werden entfernt. Der Editor bietet für Soft Skills künftig
-- keinen Lieblingsarbeit-Regler mehr, die Anzeige filtert sie zusätzlich aus.
-- Reine Datenbereinigung – kein Schema-Change.
-- =============================================================================

delete from public.work_preferences
where name in (
  'Teamfähigkeit',
  'Konfliktfähigkeit',
  'Kommunikationsstärke',
  'Kreativität',
  'Eigenverantwortung',
  'Zuverlässigkeit & Termintreue',
  'Kundenorientierung',
  'Lernbereitschaft',
  'Sorgfalt & Detailgenauigkeit'
);
