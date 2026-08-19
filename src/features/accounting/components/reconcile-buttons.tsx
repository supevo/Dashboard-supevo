'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  runReconcileAction,
  applyAllConfidentAction,
  applyPaymentMatchAction,
  applyReceiptMatchAction,
  applyComboMatchAction,
  applySplitMatchAction,
  dismissPaymentMatchAction,
  dismissReceiptMatchAction,
  dismissComboMatchAction,
  dismissSplitMatchAction,
} from '@/features/accounting/reconcile-actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/**
 * Recomputes the suggestions and reports how many are open for review. Writes
 * NOTHING – nothing is booked automatically; every match is confirmed by hand.
 * The scope dropdown limits the count to one month or all open items.
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={run}
        disabled={busy}
        title="Aktualisiert die Vorschläge – verbucht nichts automatisch"
      >
        {busy ? 'Aktualisiere …' : '🔄 Vorschläge aktualisieren'}
      </Button>
      {msg && <Alert className="py-1 text-xs">{msg}</Alert>}
    </div>
  );
}

/**
 * Pure view toggle: switches the panel into (or out of) the lenient pass
 * (?rerun=1), which lowers the suggest bar so sub-80 % candidates get a second,
 * MANUAL chance. Books nothing – it only changes what is shown.
 */
export function RerunReconcileButton({
  rerunHref,
  active,
}: {
  /** URL that turns the lenient pass on; a plain href turns it off. */
  rerunHref: string;
  active: boolean;
}) {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant={active ? 'default' : 'outline'}
      size="sm"
      onClick={() => {
        router.push(rerunHref);
        router.refresh();
      }}
      title="Zeigt zusätzlich schwächere Treffer (ab 35 %) zum manuellen Prüfen – verbucht nichts"
    >
      {active ? '🔁 Unsichere Treffer ausblenden' : '🔁 Unsichere Treffer zeigen'}
    </Button>
  );
}

/**
 * Übernimmt in einem Schwung ALLE sicheren Vorschläge (ab 70 %) des aktuellen
 * Zeitraums – statt jeden einzeln zu bestätigen. Mit Rückfrage, weil es viele
 * Buchungen auf einmal verbucht.
 */
export function ApplyAllButton({
  billingEntityId,
  year,
  month,
}: {
  billingEntityId: string;
  year: number;
  month: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    if (
      !window.confirm(
        'Alle sicheren Vorschläge (ab 70 %) des aktuellen Zeitraums übernehmen?\n\nEinzelne unsichere Vorschläge bleiben zum manuellen Prüfen bestehen.',
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await applyAllConfidentAction(billingEntityId, {
      year,
      month: month >= 1 && month <= 12 ? month : undefined,
    });
    setBusy(false);
    setMsg('message' in res ? (res.message ?? '') : '');
    if (res.status === 'success') router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={run}
        disabled={busy}
        title="Übernimmt alle Vorschläge ab 70 % Sicherheit auf einmal"
      >
        {busy ? 'Übernehme …' : '✅ Alle sicheren übernehmen'}
      </Button>
      {msg && <Alert className="py-1 text-xs">{msg}</Alert>}
    </div>
  );
}

type ActionFn = () => Promise<{ status: string }>;

/** Übernehmen + Ablehnen side by side, sharing one busy state. */
function ApplyReject({ apply, reject }: { apply: ActionFn; reject: ActionFn }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(fn: ActionFn) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.status === 'success') router.refresh();
  }
  return (
    <div className="flex items-center justify-end gap-1">
      <Button type="button" size="sm" onClick={() => run(apply)} disabled={busy}>
        {busy ? '…' : 'Übernehmen'}
      </Button>
      <button
        type="button"
        onClick={() => run(reject)}
        disabled={busy}
        title="Vorschlag ablehnen – diese Kombination wird nicht mehr vorgeschlagen"
        aria-label="Ablehnen"
        className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-rose-600 disabled:opacity-50"
      >
        ✕ Ablehnen
      </button>
    </div>
  );
}

/** Confirms/rejects one suggestion (payment↔invoice or receipt↔transaction). */
export function ApplyMatchButton(
  props:
    | { kind: 'payment'; transactionId: string; invoiceId: string }
    | { kind: 'receipt'; receiptId: string; transactionId: string },
) {
  return (
    <ApplyReject
      apply={() =>
        props.kind === 'payment'
          ? applyPaymentMatchAction({
              transactionId: props.transactionId,
              invoiceId: props.invoiceId,
            })
          : applyReceiptMatchAction({
              receiptId: props.receiptId,
              transactionId: props.transactionId,
            })
      }
      reject={() =>
        props.kind === 'payment'
          ? dismissPaymentMatchAction({
              transactionId: props.transactionId,
              invoiceId: props.invoiceId,
            })
          : dismissReceiptMatchAction({
              receiptId: props.receiptId,
              transactionId: props.transactionId,
            })
      }
    />
  );
}

/** Confirms/rejects one split suggestion (several payments ↔ one invoice). */
export function ApplySplitButton({
  invoiceId,
  transactionIds,
}: {
  invoiceId: string;
  transactionIds: string[];
}) {
  return (
    <ApplyReject
      apply={() => applySplitMatchAction({ invoiceId, transactionIds })}
      reject={() => dismissSplitMatchAction({ invoiceId, transactionIds })}
    />
  );
}

/** Confirms/rejects one combination suggestion (payment ↔ several invoices). */
export function ApplyComboButton({
  transactionId,
  invoiceIds,
}: {
  transactionId: string;
  invoiceIds: string[];
}) {
  return (
    <ApplyReject
      apply={() => applyComboMatchAction({ transactionId, invoiceIds })}
      reject={() => dismissComboMatchAction({ transactionId, invoiceIds })}
    />
  );
}
