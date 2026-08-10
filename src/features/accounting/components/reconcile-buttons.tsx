'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  runReconcileAction,
  applyPaymentMatchAction,
  applyReceiptMatchAction,
  applyComboMatchAction,
} from '@/features/accounting/reconcile-actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/**
 * Runs the reconcile engine (auto-applies confident matches). The scope dropdown
 * limits it to one month or runs across all open items – so earlier months with
 * still-open payments can be caught up.
 */
export function RunReconcileButton({
  billingEntityId,
  year,
  month,
}: {
  billingEntityId: string;
  year: number;
  /** 0 = alle Monate; 1–12 = nur dieser Monat (±3 Tage). */
  month: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await runReconcileAction(billingEntityId, {
      year,
      month: month >= 1 && month <= 12 ? month : undefined,
    });
    setBusy(false);
    setMsg('message' in res ? (res.message ?? '') : '');
    if (res.status === 'success') router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
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

/** Confirms one combination suggestion (payment ↔ several invoices). */
export function ApplyComboButton({
  transactionId,
  invoiceIds,
}: {
  transactionId: string;
  invoiceIds: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);
    const res = await applyComboMatchAction({ transactionId, invoiceIds });
    setBusy(false);
    if (res.status === 'success') router.refresh();
  }

  return (
    <Button type="button" size="sm" onClick={apply} disabled={busy}>
      {busy ? '…' : 'Übernehmen'}
    </Button>
  );
}
