'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateReceiptFieldsAction } from '@/features/accounting/receipt-actions';
import { formatEuroCents } from '@/lib/money';

function formatDate(d: string | null): string {
  if (!d) return '—';
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString('de-DE');
}

/**
 * Inline-editable Händler / Belegdatum / Bruttobetrag of one receipt, for when
 * the KI read a value wrong. Renders the three <td> cells directly (fragment)
 * so it drops into the Beleg table row. Pencil → inputs → Speichern/Abbrechen.
 */
export function ReceiptFieldsEdit({
  receiptId,
  haendler,
  belegDatum,
  bruttoCents,
}: {
  receiptId: string;
  haendler: string | null;
  belegDatum: string | null;
  bruttoCents: number | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [h, setH] = useState(haendler ?? '');
  const [d, setD] = useState(belegDatum ?? '');
  const [betrag, setBetrag] = useState(
    bruttoCents != null ? (bruttoCents / 100).toFixed(2) : '',
  );

  function reset() {
    setH(haendler ?? '');
    setD(belegDatum ?? '');
    setBetrag(bruttoCents != null ? (bruttoCents / 100).toFixed(2) : '');
  }

  async function save() {
    setBusy(true);
    const parsedBetrag = betrag.trim()
      ? Math.round(parseFloat(betrag.replace(',', '.')) * 100)
      : null;
    const res = await updateReceiptFieldsAction({
      receiptId,
      haendler: h.trim() || null,
      belegDatum: d || null,
      bruttoCents: Number.isFinite(parsedBetrag as number) ? parsedBetrag : null,
    });
    setBusy(false);
    if (res.status === 'success') {
      setEditing(false);
      router.refresh();
    }
  }

  if (!editing) {
    return (
      <>
        <td className="px-3 py-2">{haendler ?? '—'}</td>
        <td className="px-3 py-2">{formatDate(belegDatum)}</td>
        <td className="px-3 py-2 text-right">
          <span className="inline-flex items-center gap-2">
            <span>{bruttoCents != null ? formatEuroCents(bruttoCents) : '—'}</span>
            <button
              type="button"
              onClick={() => {
                reset();
                setEditing(true);
              }}
              className="text-xs text-muted-foreground hover:text-primary"
              title="Händler, Datum und Betrag korrigieren"
              aria-label="Beleg bearbeiten"
            >
              ✏️
            </button>
          </span>
        </td>
      </>
    );
  }

  return (
    <>
      <td className="px-3 py-2">
        <input
          value={h}
          onChange={(e) => setH(e.target.value)}
          className="w-full rounded border bg-background px-2 py-1 text-sm"
          placeholder="Händler"
          disabled={busy}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="date"
          value={d}
          onChange={(e) => setD(e.target.value)}
          className="rounded border bg-background px-2 py-1 text-sm"
          disabled={busy}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <input
            inputMode="decimal"
            value={betrag}
            onChange={(e) => setBetrag(e.target.value)}
            className="w-24 rounded border bg-background px-2 py-1 text-right text-sm"
            placeholder="0,00"
            disabled={busy}
          />
          <span className="text-xs text-muted-foreground">€</span>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="ml-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
          >
            {busy ? '…' : 'Speichern'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="rounded px-1 py-1 text-xs text-muted-foreground hover:text-foreground"
            aria-label="Abbrechen"
          >
            ✕
          </button>
        </div>
      </td>
    </>
  );
}
