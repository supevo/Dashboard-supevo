'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { formatEuroCents } from '@/lib/money';
import type { AdsMonthRow } from '@/features/ads-billing/queries';
import {
  recordAdsMonthSpentAction,
  toggleAdsMonthBilledAction,
  setAdsMandateFeeAction,
  setAdsMandateActiveAction,
} from '@/features/ads-billing/actions';

/** "12,50" / "1.234,00" → Cent, oder null. */
function parseEuroCents(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  const v = Number.parseFloat(n);
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
}

function euroInput(cents: number | null): string {
  return cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

function PlatformBadge({ platform }: { platform: 'meta' | 'google' }) {
  return (
    <span
      className={
        platform === 'meta'
          ? 'rounded px-1.5 py-0.5 text-xs font-medium text-blue-700 bg-blue-500/10 dark:text-blue-300'
          : 'rounded px-1.5 py-0.5 text-xs font-medium text-red-700 bg-red-500/10 dark:text-red-300'
      }
    >
      {platform === 'meta' ? 'Meta' : 'Google'}
    </span>
  );
}

function Row({
  row,
  year,
  month,
}: {
  row: AdsMonthRow;
  year: number;
  month: number;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [spent, setSpent] = useState(euroInput(row.spentCents));
  const [fee, setFee] = useState(euroInput(row.monthlyFeeCents));

  function saveSpent() {
    const cents = parseEuroCents(spent);
    if (cents === row.spentCents || (spent.trim() === '' && row.spentCents == null)) return;
    start(async () => {
      const res = await recordAdsMonthSpentAction({
        mandateId: row.id,
        year,
        month,
        spentCents: cents,
      });
      if (res.status === 'success') router.refresh();
    });
  }

  function saveFee() {
    const cents = parseEuroCents(fee);
    if (cents === row.monthlyFeeCents) return;
    start(async () => {
      const res = await setAdsMandateFeeAction({ mandateId: row.id, feeCents: cents });
      if (res.status === 'success') router.refresh();
    });
  }

  function toggleBilled() {
    start(async () => {
      const res = await toggleAdsMonthBilledAction({
        mandateId: row.id,
        year,
        month,
        billed: !row.billed,
      });
      if (res.status === 'success') router.refresh();
    });
  }

  function togglePause() {
    start(async () => {
      const res = await setAdsMandateActiveAction({ mandateId: row.id, active: false });
      if (res.status === 'success') router.refresh();
    });
  }

  const attn = row.spentCents == null || !row.billed;

  return (
    <tr className={`border-t align-middle ${attn ? 'bg-amber-500/[0.05]' : ''}`}>
      <td className="px-3 py-2">
        <div className="font-medium">{row.clientName ?? '—'}</div>
        <div className="mt-0.5">
          <PlatformBadge platform={row.platform} />
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <Input
            value={spent}
            onChange={(e) => setSpent(e.target.value)}
            onBlur={saveSpent}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            placeholder="0,00"
            inputMode="decimal"
            className="h-8 w-24 text-right text-sm"
            disabled={busy}
          />
          <span className="text-xs text-muted-foreground">€</span>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <Input
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            onBlur={saveFee}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            placeholder="—"
            inputMode="decimal"
            className="h-8 w-24 text-right text-sm"
            disabled={busy}
          />
          <span className="text-xs text-muted-foreground">€/M</span>
        </div>
      </td>
      <td className="px-3 py-2 text-center">
        <label className="inline-flex cursor-pointer items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={row.billed}
            onChange={toggleBilled}
            disabled={busy}
            className="h-4 w-4"
          />
          <span className={row.billed ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
            {row.billed ? 'abgerechnet' : 'offen'}
          </span>
        </label>
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={togglePause}
          disabled={busy}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
          title="Mandat pausieren (läuft nicht mehr monatlich)"
        >
          pausieren
        </button>
      </td>
    </tr>
  );
}

/**
 * Monatsboard der Ads-Mandate: verbrauchtes Budget eintragen (Mitarbeiter-Angabe),
 * Kundenpauschale pflegen und den Monat als abgerechnet abhaken.
 */
export function AdsBoardPanel({
  rows,
  year,
  month,
}: {
  rows: AdsMonthRow[];
  year: number;
  month: number;
}) {
  const offen = rows.filter((r) => r.spentCents == null || !r.billed).length;
  const summe = rows.reduce((n, r) => n + (r.spentCents ?? 0), 0);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Noch keine aktiven Ads-Mandate. Sie entstehen automatisch, wenn in einer
        Aufgabe Meta/Google Ads erkannt werden und du &bdquo;Wir zahlen&ldquo;
        wählst.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm">
        <span className={offen > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-400'}>
          {offen > 0 ? `⚠ ${offen} offen (Verbrauch/Abrechnung)` : '✓ alles erfasst & abgerechnet'}
        </span>
        <span className="text-muted-foreground">
          Verbrauch gesamt: {formatEuroCents(summe)}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Kunde / Plattform</th>
              <th className="px-3 py-2 font-medium">Verbrauch im Monat</th>
              <th className="px-3 py-2 font-medium">Kundenpauschale</th>
              <th className="px-3 py-2 text-center font-medium">Abgerechnet?</th>
              <th className="px-3 py-2 text-right font-medium">Mandat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.id} row={r} year={year} month={month} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Der Verbrauch ist deine eigene Angabe (Plattform-Rechnungen kommen oft
        verspätet/pauschal). Die Kundenpauschale ist der feste Monatsbetrag – die
        automatische Kundenrechnung folgt in einem späteren Schritt.
      </p>
    </div>
  );
}
