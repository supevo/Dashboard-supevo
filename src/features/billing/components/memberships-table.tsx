'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { formatEuroCents } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { MembershipListRow } from '@/features/billing/memberships-list-queries';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: 'Aktiv', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  paused: { label: 'Pausiert', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  canceled: { label: 'Gekündigt', cls: 'bg-muted text-muted-foreground' },
};

const INTERVAL_LABEL: Record<number, string> = {
  1: 'monatlich',
  3: 'quartalsweise',
  12: 'jährlich',
};

type StatusFilter = 'all' | 'active' | 'paused' | 'canceled' | 'attention';
type SortKey = 'name' | 'price' | 'start' | 'end';

function fmtDay(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y?.slice(2)}`;
}

/** Tage bis zum Vertragsende (negativ = bereits vorbei), null wenn kein Ende. */
function daysUntil(iso: string | null, todayIso: string): number | null {
  if (!iso) return null;
  const a = Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(todayIso.slice(0, 4)),
    Number(todayIso.slice(5, 7)) - 1,
    Number(todayIso.slice(8, 10)),
  );
  return Math.round((a - b) / 86_400_000);
}

export function MembershipsTable({
  rows,
  todayIso,
}: {
  rows: MembershipListRow[];
  todayIso: string;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [pay, setPay] = useState<'all' | 'sepa' | 'transfer'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: 'name',
    dir: 1,
  });

  // Handlungsbedarf: SEPA ohne Mandat, Vertrag läuft in ≤60 Tagen aus, oder
  // kein Startdatum hinterlegt.
  const needsAttention = (r: MembershipListRow): boolean => {
    if (r.status === 'canceled') return false;
    if (r.sepaMandateMissing) return true;
    if (!r.startDate) return true;
    const d = daysUntil(r.contractEndIso, todayIso);
    return d != null && d >= 0 && d <= 60;
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (status === 'attention') {
        if (!needsAttention(r)) return false;
      } else if (status !== 'all' && r.status !== status) {
        return false;
      }
      if (pay !== 'all' && r.paymentMethod !== pay) return false;
      if (needle) {
        const hay = `${r.clientName} ${r.packageLabel} ${r.contactName ?? ''} ${r.contactEmail ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const dir = sort.dir;
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case 'price':
          return (a.grossCents - b.grossCents) * dir;
        case 'start':
          return (a.startDate ?? '').localeCompare(b.startDate ?? '') * dir;
        case 'end':
          return (a.contractEndIso ?? '9999').localeCompare(b.contractEndIso ?? '9999') * dir;
        default:
          return a.clientName.localeCompare(b.clientName, 'de') * dir;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, status, pay, sort, todayIso]);

  const filteredMrr = filtered
    .filter((r) => r.status === 'active')
    .reduce((n, r) => n + r.grossCents, 0);

  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-2.5 py-1 text-xs transition',
      active
        ? 'border-primary bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-muted',
    );

  const sortBtn = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => (
    <button
      type="button"
      onClick={() =>
        setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }))
      }
      className={cn(
        'inline-flex items-center gap-1 font-medium hover:text-foreground',
        align === 'right' && 'justify-end',
      )}
    >
      {label}
      {sort.key === key && <span aria-hidden>{sort.dir === 1 ? '▲' : '▼'}</span>}
    </button>
  );

  const attentionCount = rows.filter(needsAttention).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['all', 'Alle'],
              ['active', 'Aktiv'],
              ['paused', 'Pausiert'],
              ['canceled', 'Gekündigt'],
            ] as [StatusFilter, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setStatus(k)} className={chip(status === k)}>
              {l}
            </button>
          ))}
          {attentionCount > 0 && (
            <button
              type="button"
              onClick={() => setStatus('attention')}
              className={cn(
                chip(status === 'attention'),
                status !== 'attention' && 'border-amber-300 text-amber-700 dark:text-amber-300',
              )}
            >
              ⚠︎ Handlungsbedarf ({attentionCount})
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {(
            [
              ['all', 'Alle Zahlwege'],
              ['sepa', 'SEPA'],
              ['transfer', 'Überweisung'],
            ] as ['all' | 'sepa' | 'transfer', string][]
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setPay(k)} className={chip(pay === k)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Suchen: Kunde, Paket, Ansprechpartner …"
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine Mitgliedschaften gefunden.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{sortBtn('name', 'Kunde')}</th>
                <th className="px-3 py-2 font-medium">Paket / Tarif</th>
                <th className="px-3 py-2">{sortBtn('start', 'Start')}</th>
                <th className="px-3 py-2">{sortBtn('end', 'Laufzeit')}</th>
                <th className="px-3 py-2 font-medium">Ansprechpartner</th>
                <th className="px-3 py-2 font-medium">Zahlweg</th>
                <th className="px-3 py-2 text-right">{sortBtn('price', '€ / Monat', 'right')}</th>
                <th className="px-3 py-2 font-medium">Zyklus</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const st = STATUS_META[r.status] ?? { label: r.status, cls: 'bg-muted text-muted-foreground' };
                const endDays = daysUntil(r.contractEndIso, todayIso);
                const endsSoon = r.status !== 'canceled' && endDays != null && endDays >= 0 && endDays <= 60;
                return (
                  <tr key={r.clientCompanyId} className="border-t align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.clientName}</div>
                      <span className={cn('mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px]', st.cls)}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.packageLabel}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {r.startDate ? (
                        fmtDay(r.startDate)
                      ) : (
                        <span className="text-destructive" title="Kein Startdatum hinterlegt">
                          fehlt
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {r.termMonths && r.termMonths > 0 ? (
                        <div>
                          <div>{r.termMonths} Mon.</div>
                          {r.contractEndIso && (
                            <div
                              className={cn(
                                'text-[11px]',
                                endsSoon ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                              )}
                            >
                              bis {fmtDay(r.contractEndIso)}
                              {endsSoon ? ' · läuft aus' : ''}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">unbefristet</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.contactName || r.contactEmail ? (
                        <div>
                          {r.contactName && <div>{r.contactName}</div>}
                          {r.contactEmail && (
                            <div className="text-[11px] text-muted-foreground">{r.contactEmail}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.paymentMethod === 'transfer' ? (
                        'Überweisung'
                      ) : r.sepaMandateMissing ? (
                        <span className="text-destructive" title="SEPA gewählt, aber kein Mandat/IBAN hinterlegt">
                          SEPA – Mandat fehlt
                        </span>
                      ) : (
                        'SEPA-Mandat'
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <div className="font-medium">{formatEuroCents(r.grossCents)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatEuroCents(r.netCents)} netto
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {INTERVAL_LABEL[r.intervalMonths] ?? `alle ${r.intervalMonths} Mon.`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <Link
                        href={`/app/clients/${r.clientCompanyId}?settings=billing`}
                        className="text-primary hover:underline"
                      >
                        Ändern
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 text-xs">
                <td className="px-3 py-2 font-medium" colSpan={6}>
                  {filtered.length} angezeigt · Summe aktiver Abos
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                  {formatEuroCents(filteredMrr)}
                </td>
                <td className="px-3 py-2 text-muted-foreground">/ Monat</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
