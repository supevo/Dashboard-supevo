'use client';

import { Button } from '@/components/ui/button';
import type { BookingExportRow } from '@/features/accounting/export-queries';

function csvCell(v: string): string {
  // Deutsches Excel: Semikolon-Trenner; Anführungszeichen escapen.
  return `"${(v ?? '').replace(/"/g, '""')}"`;
}

const HEADER = [
  'Datum',
  'Art',
  'Betrag (EUR)',
  'Kategorie',
  'EÜR-Position',
  'USt-Satz (%)',
  'Gegenpartei',
  'Verwendungszweck',
  'Beleg vorhanden',
  'Beleg-Datei',
  'Rechnungsnummer',
];

/**
 * Steuerberater-Export: alle Buchungen des Zeitraums als semikolon-getrennte
 * CSV (UTF-8 mit BOM, damit Excel Umlaute korrekt liest).
 */
export function ExportBookingsButton({
  rows,
  fileName,
}: {
  rows: BookingExportRow[];
  fileName: string;
}) {
  function download() {
    const lines = [
      HEADER.map(csvCell).join(';'),
      ...rows.map((r) =>
        [
          r.datum,
          r.art,
          r.betrag,
          r.kategorie,
          r.euer,
          r.ustSatz,
          r.gegen,
          r.zweck,
          r.belegVorhanden,
          r.belegDatei,
          r.rechnungsnummer,
        ]
          .map(csvCell)
          .join(';'),
      ),
    ];
    const blob = new Blob(['﻿' + lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={download}
      disabled={rows.length === 0}
      title="Alle Buchungen des Zeitraums als CSV für den Steuerberater exportieren"
    >
      🧾 Steuerberater-Export ({rows.length})
    </Button>
  );
}
