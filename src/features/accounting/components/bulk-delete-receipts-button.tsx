'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { bulkDeleteUnreadOneDriveReceiptsAction } from '@/features/accounting/receipt-actions';
import { Button } from '@/components/ui/button';

/**
 * Sammel-Löschen der noch nicht ausgelesenen OneDrive-Belege (ohne Datum) –
 * zum Aufräumen nach einem versehentlichen Massen-Import. Fragt vorher nach.
 */
export function BulkDeleteReceiptsButton({
  billingEntityId,
  kind,
  count,
}: {
  billingEntityId: string;
  kind?: 'einnahme' | 'ausgabe';
  count: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (count <= 0) return null;

  async function run() {
    setBusy(true);
    const res = await bulkDeleteUnreadOneDriveReceiptsAction({
      billingEntityId,
      kind,
    });
    setBusy(false);
    setConfirm(false);
    if (res.status === 'success') router.refresh();
  }

  if (confirm) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {count} nicht ausgelesene Belege endgültig löschen?
        </span>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={run}
        >
          Ja, löschen
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => setConfirm(false)}
        >
          Abbrechen
        </Button>
      </span>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => setConfirm(true)}
      title="Löscht nur die noch nicht ausgelesenen OneDrive-Belege (ohne Datum). Ausgelesene/zugeordnete Belege und die OneDrive-Dateien bleiben."
    >
      🧹 Nicht ausgelesene OneDrive-Belege löschen ({count})
    </Button>
  );
}
