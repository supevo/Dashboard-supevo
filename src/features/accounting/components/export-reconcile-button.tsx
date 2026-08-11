'use client';

import { Button } from '@/components/ui/button';

export interface ReconcileExportRow {
  art: 'Einnahme' | 'Ausgabe';
  datum: string;
  beschreibung: string;
  betrag: string; // formatted euros, e.g. "158,00"
  zuordnung: string;
  score: string; // "99 %"
  grund: string;
}

function csvCell(v: string): string {
  // German Excel: semicolon separator; quote and escape.
  return `"${(v ?? '').replace(/"/g, '""')}"`;
}

/** Downloads the current reconcile view as a semicolon-separated CSV (UTF-8). */
export function ExportReconcileButton({
  rows,
  fileName,
}: {
  rows: ReconcileExportRow[];
  fileName: string;
}) {
  function download() {
    const header = [
      'Art',
      'Datum',
      'Beschreibung',
      'Betrag (EUR)',
      'Zuordnung',
      'Score',
      'Begründung',
    ];
    const lines = [
      header.map(csvCell).join(';'),
      ...rows.map((r) =>
        [r.art, r.datum, r.beschreibung, r.betrag, r.zuordnung, r.score, r.grund]
          .map(csvCell)
          .join(';'),
      ),
    ];
    // BOM so Excel reads umlauts correctly.
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
      title="Aktuelle Abgleich-Ansicht als CSV exportieren"
    >
      ⬇️ CSV-Export
    </Button>
  );
}
