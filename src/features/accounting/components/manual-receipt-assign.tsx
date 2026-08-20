'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { applyReceiptMatchAction } from '@/features/accounting/reconcile-actions';

/**
 * Manuelle Zuordnung: hängt einen offenen Ausgabe-Beleg an eine Bankbuchung, für
 * die der Auto-Abgleich keinen Vorschlag gefunden hat (z. B. falsch erkannte
 * Währung, abweichender Betrag). Umgeht die Score-Prüfung bewusst.
 */
export function ManualReceiptAssign({
  transactionId,
  receipts,
}: {
  transactionId: string;
  receipts: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [sel, setSel] = useState('');
  const [busy, setBusy] = useState(false);
  if (receipts.length === 0) return null;

  async function assign() {
    if (!sel) return;
    setBusy(true);
    const res = await applyReceiptMatchAction({ receiptId: sel, transactionId });
    setBusy(false);
    if (res.status === 'success') router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <select
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        disabled={busy}
        className="max-w-[15rem] rounded border bg-background px-2 py-1 text-xs"
        title="Diesen Beleg der Buchung manuell zuordnen"
      >
        <option value="">Beleg manuell zuordnen …</option>
        {receipts.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={assign}
        disabled={busy || !sel}
        className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
      >
        {busy ? '…' : 'OK'}
      </button>
    </div>
  );
}
