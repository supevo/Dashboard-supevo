'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  runReconcileAction,
  applyPaymentMatchAction,
  applyReceiptMatchAction,
} from '@/features/accounting/reconcile-actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/** Runs the reconcile engine (auto-applies confident matches). */
export function RunReconcileButton({ billingEntityId }: { billingEntityId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await runReconcileAction(billingEntityId);
    setBusy(false);
    setMsg('message' in res ? (res.message ?? '') : '');
    if (res.status === 'success') router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={busy}>
        {busy ? 'Gleiche ab …' : '🔗 Abgleich starten'}
      </Button>
      {msg && <Alert className="py-1 text-xs">{msg}</Alert>}
    </div>
  );
}

/** Confirms one suggestion (payment↔invoice or receipt↔transaction). */
export function ApplyMatchButton(
  props:
    | { kind: 'payment'; transactionId: string; invoiceId: string }
    | { kind: 'receipt'; receiptId: string; transactionId: string },
) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);
    const res =
      props.kind === 'payment'
        ? await applyPaymentMatchAction({
            transactionId: props.transactionId,
            invoiceId: props.invoiceId,
          })
        : await applyReceiptMatchAction({
            receiptId: props.receiptId,
            transactionId: props.transactionId,
          });
    setBusy(false);
    if (res.status === 'success') router.refresh();
  }

  return (
    <Button type="button" size="sm" onClick={apply} disabled={busy}>
      {busy ? '…' : 'Übernehmen'}
    </Button>
  );
}
