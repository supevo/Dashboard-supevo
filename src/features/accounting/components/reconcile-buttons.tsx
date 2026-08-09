'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  runReconcileAction,
  applyPaymentMatchAction,
  applyReceiptMatchAction,
} from '@/features/accounting/reconcile-actions';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/**
 * Runs the reconcile engine (auto-applies confident matches). The scope dropdown
 * limits it to one month or runs across all open items – so earlier months with
 * still-open payments can be caught up.
 */
export function RunReconcileButton({
  billingEntityId,
  year,
}: {
  billingEntityId: string;
  year: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState('all');
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const month = scope === 'all' ? undefined : Number(scope);
    const res = await runReconcileAction(billingEntityId, {
      year,
      month,
    });
    setBusy(false);
    setMsg('message' in res ? (res.message ?? '') : '');
    if (res.status === 'success') router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        disabled={busy}
        className="h-9 w-auto"
      >
        <option value="all">Alle offenen</option>
        {MONTHS.map((m, i) => (
          <option key={i} value={String(i + 1)}>
            {m} {year}
          </option>
        ))}
      </Select>
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
