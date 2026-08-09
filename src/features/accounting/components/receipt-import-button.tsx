'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { importOneDriveReceiptsAction } from '@/features/accounting/receipt-actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/** Triggers a OneDrive scan+import for one company/folder (Einnahmen/Ausgaben). */
export function ReceiptImportButton({
  billingEntityId,
  kind,
  linked,
}: {
  billingEntityId: string;
  kind: 'einnahmen' | 'ausgaben';
  linked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await importOneDriveReceiptsAction({ billingEntityId, kind });
    setBusy(false);
    const text = 'message' in res ? (res.message ?? '') : '';
    setMsg({ ok: res.status === 'success', text });
    if (res.status === 'success') router.refresh();
  }

  const label = kind === 'einnahmen' ? 'Einnahmen' : 'Ausgaben';

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={run}
        disabled={busy || !linked}
      >
        {busy ? 'Scanne …' : `📥 ${label} aus OneDrive importieren`}
      </Button>
      {!linked && (
        <p className="text-xs text-muted-foreground">
          Kein {label}-Ordner verknüpft (Tab „Firmen“).
        </p>
      )}
      {msg && (
        <Alert variant={msg.ok ? 'default' : 'destructive'}>{msg.text}</Alert>
      )}
    </div>
  );
}
