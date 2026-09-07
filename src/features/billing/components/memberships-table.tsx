'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { formatEuroCents } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { MembershipListRow } from '@/features/billing/memberships-list-queries';
import {
  setMembershipCollectedAction,
  setMembershipStatusAction,
  generateDraftInvoiceAction,
} from '@/features/billing/membership-overview-actions';

const STATUS_META: Record<string, { label: string; cls: string; order: number }> = {
  active: { label: 'Aktiv', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300', order: 0 },
  paused: { label: 'Pausiert', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300', order: 1 },
  canceled: { label: 'Gekündigt', cls: 'bg-muted text-muted-foreground', order: 2 },
};

const INTERVAL_LABEL: Record<number, string> = {
  1: 'monatlich',
  3: 'quartalsweise',
  12: 'jährlich',
};

type StatusFilter = 'all' | 'active' | 'paused' | 'canceled' | 'attention';
type SortKey = 'name' | 'price' | 'start' | 'end';
type GroupBy = 'none' | 'status' | 'pay' | 'category';

function fmtDay(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y?.slice(2)}`;
}

/** Tage bis zum Datum (negativ = vorbei), null wenn kein Datum. */
function daysUntil(iso: string | null, todayIso: string): number | null {
  if (!iso) return null;
  const a = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const b = Date.UTC(Number(todayIso.slice(0, 4)), Number(todayIso.slice(5, 7)) - 1, Number(todayIso.slice(8, 10)));
  return Math.round((a - b) / 86_400_000);
}

export function MembershipsTable({
  rows,
  todayIso,
  period,
}: {
  rows: MembershipListRow[];
  todayIso: string;
  period: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Lokale Kopie für optimistische Updates (Zahlung/Status); folgt neuen Props.
  const [data, setData] = useState(rows);
  useEffect(() => setData(rows), [rows]);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [pay, setPay] = useState<'all' | 'sepa' | 'transfer'>('all');
  const [group, setGroup] = useState<GroupBy>('none');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });

  const needsAttention = (r: MembershipListRow): boolean => {
    if (r.status === 'canceled') return false;
    if (r.sepaMandateMissing) return true;
    if (!r.startDate) return true;
    const d = daysUntil(r.cancelDeadlineIso, todayIso);
    return d != null && d >= 0 && d <= 60;
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = data.filter((r) => {
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
          return (a.cancelDeadlineIso ?? '9999').localeCompare(b.cancelDeadlineIso ?? '9999') * dir;
        default:
          return a.clientName.localeCompare(b.clientName, 'de') * dir;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, q, status, pay, sort, todayIso]);

  // Gruppierung: eine Liste von {label, rows}, in sinnvoller Reihenfolge.
  const groups = useMemo(() => {
    if (group === 'none') return [{ label: '', rows: filtered }];
    const keyOf = (r: MembershipListRow): { k: string; label: string; order: number } => {
      if (group === 'status') {
        const m = STATUS_META[r.status];
        return { k: r.status, label: m?.label ?? r.status, order: m?.order ?? 9 };
      }
      if (group === 'pay') {
        return r.paymentMethod === 'transfer'
          ? { k: 'transfer', label: 'Überweisung', order: 1 }
          : { k: 'sepa', label: 'SEPA-Lastschrift', order: 0 };
      }
      return r.isLegacy
        ? { k: 'legacy', label: 'supevo Smart (Bestand)', order: 1 }
        : { k: 'std', label: 'supevo Mitgliedschaften', order: 0 };
    };
    const map = new Map<string, { label: string; order: number; rows: MembershipListRow[] }>();
    for (const r of filtered) {
      const { k, label, order } = keyOf(r);
      if (!map.has(k)) map.set(k, { label, order, rows: [] });
      map.get(k)!.rows.push(r);
    }
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [filtered, group]);

  const filteredMrr = filtered
    .filter((r) => r.status === 'active')
    .reduce((n, r) => n + r.grossCents, 0);

  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-2.5 py-1 text-xs transition',
      active ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
    );

  const sortBtn = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => (
    <button
      type="button"
      onClick={() =>
        setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }))
      }
      className={cn('inline-flex items-center gap-1 font-medium hover:text-foreground', align === 'right' && 'justify-end')}
    >
      {label}
      {sort.key === key && <span aria-hidden>{sort.dir === 1 ? '▲' : '▼'}</span>}
    </button>
  );

  const attentionCount = data.filter(needsAttention).length;
  const periodLabel = `${period.slice(5, 7)}/${period.slice(2, 4)}`;

  function toggleCollected(r: MembershipListRow, next: boolean) {
    setData((prev) =>
      prev.map((x) => (x.clientCompanyId === r.clientCompanyId ? { ...x, collected: next } : x)),
    );
    startTransition(async () => {
      const res = await setMembershipCollectedAction({
        clientCompanyId: r.clientCompanyId,
        period,
        collected: next,
      });
      if (res.status === 'error') {
        setData((prev) =>
          prev.map((x) => (x.clientCompanyId === r.clientCompanyId ? { ...x, collected: !next } : x)),
        );
        alert(res.message);
      }
    });
  }

  function changeStatus(r: MembershipListRow, next: 'active' | 'paused' | 'canceled') {
    const prevStatus = r.status;
    setData((prev) =>
      prev.map((x) => (x.clientCompanyId === r.clientCompanyId ? { ...x, status: next } : x)),
    );
    startTransition(async () => {
      const res = await setMembershipStatusAction({ clientCompanyId: r.clientCompanyId, status: next });
      if (res.status === 'error') {
        setData((prev) =>
          prev.map((x) => (x.clientCompanyId === r.clientCompanyId ? { ...x, status: prevStatus } : x)),
        );
        alert(res.message);
      }
    });
  }

  function makeDraft(r: MembershipListRow) {
    startTransition(async () => {
      const res = await generateDraftInvoiceAction(r.clientCompanyId);
      const msg =
        res.status === 'error'
          ? res.message
          : res.status === 'success'
            ? (res.message ?? 'Rechnungsentwurf erstellt.')
            : 'Rechnungsentwurf erstellt.';
      alert(msg);
      if (res.status === 'success') router.refresh();
    });
  }

  const closeMenu = (e: React.MouseEvent) => {
    (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
  };

  const menuItem = 'block w-full px-3 py-1.5 text-left text-xs hover:bg-muted';

  const colCount = 10;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {([['all', 'Alle'], ['active', 'Aktiv'], ['paused', 'Pausiert'], ['canceled', 'Gekündigt']] as [StatusFilter, string][]).map(
            ([k, l]) => (
              <button key={k} type="button" onClick={() => setStatus(k)} className={chip(status === k)}>
                {l}
              </button>
            ),
          )}
          {attentionCount > 0 && (
            <button
              type="button"
              onClick={() => setStatus('attention')}
              className={cn(chip(status === 'attention'), status !== 'attention' && 'border-amber-300 text-amber-700 dark:text-amber-300')}
            >
              ⚠︎ Handlungsbedarf ({attentionCount})
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {([['all', 'Alle Zahlwege'], ['sepa', 'SEPA'], ['transfer', 'Überweisung']] as ['all' | 'sepa' | 'transfer', string][]).map(
            ([k, l]) => (
              <button key={k} type="button" onClick={() => setPay(k)} className={chip(pay === k)}>
                {l}
              </button>
            ),
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Suchen: Kunde, Paket, Ansprechpartner …"
          className="max-w-sm"
        />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Gruppieren:</span>
          {([['none', 'Keine'], ['status', 'Status'], ['pay', 'Zahlweg'], ['category', 'Kategorie']] as [GroupBy, string][]).map(
            ([k, l]) => (
              <button key={k} type="button" onClick={() => setGroup(k)} className={chip(group === k)}>
                {l}
              </button>
            ),
          )}
        </div>
      </div>

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
                <th className="px-3 py-2 text-center font-medium">Zahlung {periodLabel}</th>
                <th className="px-3 py-2 font-medium">Zyklus</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupBlock key={g.label || 'all'} label={g.label}>
                  {g.rows.map((r) => {
                    const st = STATUS_META[r.status] ?? { label: r.status, cls: 'bg-muted text-muted-foreground' };
                    const endDays = daysUntil(r.cancelDeadlineIso, todayIso);
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
                              <div className="flex items-center gap-1">
                                {r.termMonths} Mon.
                                {r.autoRenew && (
                                  <span title="Verlängert sich automatisch" aria-hidden>
                                    ♻
                                  </span>
                                )}
                              </div>
                              {r.contractEndIso && (
                                <div className="text-[11px] text-muted-foreground">
                                  {r.autoRenew ? 'akt. bis ' : 'bis '}
                                  {fmtDay(r.contractEndIso)}
                                </div>
                              )}
                              {r.cancelDeadlineIso && r.noticePeriodMonths ? (
                                <div className={cn('text-[11px]', endsSoon ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                                  kündbar bis {fmtDay(r.cancelDeadlineIso)}
                                  {endsSoon ? ' · bald' : ''}
                                </div>
                              ) : endsSoon ? (
                                <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">läuft aus</div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">unbefristet</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {r.contactName || r.contactEmail ? (
                            <div>
                              {r.contactName && <div>{r.contactName}</div>}
                              {r.contactEmail && <div className="text-[11px] text-muted-foreground">{r.contactEmail}</div>}
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
                          <div className="text-[11px] text-muted-foreground">{formatEuroCents(r.netCents)} netto</div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <label className="inline-flex cursor-pointer items-center" title={`Zahlung ${periodLabel} abgebucht`}>
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer"
                              checked={r.collected}
                              onChange={(e) => toggleCollected(r, e.target.checked)}
                            />
                          </label>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {INTERVAL_LABEL[r.intervalMonths] ?? `alle ${r.intervalMonths} Mon.`}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <details className="group relative inline-block text-left">
                            <summary className="cursor-pointer list-none rounded px-2 py-1 text-muted-foreground hover:bg-muted [&::-webkit-details-marker]:hidden">
                              ⋯
                            </summary>
                            <div className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-md border bg-card py-1 shadow-lg">
                              <Link
                                href={`/app/clients/${r.clientCompanyId}?settings=billing`}
                                className={menuItem}
                              >
                                Abrechnung öffnen
                              </Link>
                              {r.status !== 'active' && (
                                <button type="button" className={menuItem} onClick={(e) => { closeMenu(e); changeStatus(r, 'active'); }}>
                                  Aktivieren
                                </button>
                              )}
                              {r.status !== 'paused' && (
                                <button type="button" className={menuItem} onClick={(e) => { closeMenu(e); changeStatus(r, 'paused'); }}>
                                  Pausieren
                                </button>
                              )}
                              {r.status !== 'canceled' && (
                                <button type="button" className={cn(menuItem, 'text-destructive')} onClick={(e) => { closeMenu(e); if (confirm(`Mitgliedschaft von ${r.clientName} kündigen?`)) changeStatus(r, 'canceled'); }}>
                                  Kündigen
                                </button>
                              )}
                              <button type="button" className={menuItem} onClick={(e) => { closeMenu(e); makeDraft(r); }}>
                                Rechnungsentwurf erstellen
                              </button>
                            </div>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </GroupBlock>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 text-xs">
                <td className="px-3 py-2 font-medium" colSpan={6}>
                  {filtered.length} angezeigt · Summe aktiver Abos
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{formatEuroCents(filteredMrr)}</td>
                <td className="px-3 py-2 text-muted-foreground" colSpan={colCount - 7}>
                  / Monat
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/** Rendert optional eine Gruppen-Überschriftszeile über den Zeilen. */
function GroupBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      {label && (
        <tr className="bg-muted/40">
          <td colSpan={10} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </td>
        </tr>
      )}
      {children}
    </>
  );
}
