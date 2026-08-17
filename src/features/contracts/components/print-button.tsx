'use client';

import { Button } from '@/components/ui/button';

/** Löst den Browser-Druckdialog aus (dort „Als PDF speichern"). */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()} className="no-print">
      🖨️ Drucken / Als PDF speichern
    </Button>
  );
}
