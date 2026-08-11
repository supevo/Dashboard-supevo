import { listAccountingCompanies } from '@/features/accounting/queries';
import {
  getReconcileSuggestions,
  classifyByMonth,
  type PeriodClass,
} from '@/features/accounting/reconcile-queries';
import { formatEuroCents } from '@/lib/money';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CompanySwitcher,
  type CompanyOption,
} from '@/features/accounting/components/company-switcher';
import { MonthSwitcher } from '@/features/accounting/components/month-switcher';
import {
  KindFilter,
  type ArtFilter,
} from '@/features/accounting/components/kind-filter';
import {
  ExportReconcileButton,
  type ReconcileExportRow,
} from '@/features/accounting/components/export-reconcile-button';
import {
  RunReconcileButton,
  RerunReconcileButton,
  ApplyMatchButton,
  ApplyComboButton,
} from '@/features/accounting/components/reconcile-buttons';

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/** cents → German euro string without the € sign (for CSV). */
function euro(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function pct(score: number): string {
  return `${Math.round(score * 100)} %`;
}

/** Small badge for cross-boundary bookings (payment in prev/following month). */
function PeriodBadge({ period }: { period: PeriodClass }) {
  if (period !== 'vor' && period !== 'folge') return null;
  return (
    <span className="ml-2 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
      {period === 'vor' ? 'Zahlung im Vormonat' : 'Zahlung im Folgemonat'}
    </span>
  );
}

/**
 * Abgleich tab: run the reconcile engine (auto-applies confident matches) and
 * confirm the remaining suggestions. The month picker limits the view to the
 * selected month plus a ±3-day fringe; fringe bookings are flagged.
 */
export async function ReconcilePanel({
  orgId,
  activeFirma,
  year,
  month,
  art,
  weak,
  basePath,
}: {
  orgId: string;
  activeFirma?: string;
  year: number;
  month: number;
  art: ArtFilter;
  /** "Erneut abgleichen": lenient pass surfacing sub-80 % candidates. */
  weak: boolean;
  basePath: string;
}) {
  const companies = await listAccountingCompanies(orgId);
  if (companies.length === 0) {
    return (
      <EmptyState
        icon="🔗"
        title="Noch keine Firma"
        description="Lege zuerst eine Firma im Tab „Firmen“ an."
        action={{ href: '/app/finance?tab=firmen', label: 'Zu den Firmen' }}
      />
    );
  }
  const active =
    companies.find((c) => c.entity.id === activeFirma) ?? companies[0];
  if (!active) return null;
  const options: CompanyOption[] = companies.map((c) => ({
    id: c.entity.id,
    label: c.entity.name,
    isDefault: c.entity.is_default,
  }));

  const all = await getReconcileSuggestions(active.entity.id, { weak });
  // Filter to the selected month (+/- 3 days), keeping each row's period class.
  const inView = <T extends { txDatum: string }>(list: T[]) =>
    list
      .map((s) => ({ s, period: classifyByMonth(s.txDatum, year, month) }))
      .filter((x): x is { s: T; period: PeriodClass } => x.period !== null);

  // Einnahmen/Ausgaben filter by the bank booking direction. Payments &
  // Sammelzahlungen are always incoming (Einnahme); receipts can be either.
  const wantIn = art === 'einnahmen';
  const wantOut = art === 'ausgaben';
  const payments = wantOut ? [] : inView(all.payments);
  const combos = wantOut ? [] : inView(all.combos);
  const receipts = inView(all.receipts).filter(({ s }) =>
    wantIn ? s.txBetragCents > 0 : wantOut ? s.txBetragCents < 0 : true,
  );
  // "Beleg fehlt" / "Zuordnung fehlt" – open bookings with no match at all.
  const missingReceipts = wantIn ? [] : inView(all.missingReceipts);
  const missingIncoming = wantOut ? [] : inView(all.missingIncoming);

  // Flat rows for the CSV export (respects the current month + art filter).
  const exportRows: ReconcileExportRow[] = [
    ...payments.map(({ s: p }) => ({
      art: 'Einnahme' as const,
      datum: p.txDatum,
      beschreibung: p.txGegen ?? '',
      betrag: euro(p.txBetragCents),
      zuordnung: `Rechnung ${p.invoiceNumber ?? '—'} · ${p.invoiceKunde ?? '—'}`,
      score: `${Math.round(p.match.score * 100)} %`,
      grund: p.match.reason,
    })),
    ...combos.map(({ s: c }) => ({
      art: 'Einnahme' as const,
      datum: c.txDatum,
      beschreibung: c.txGegen ?? '',
      betrag: euro(c.match.paymentCents),
      zuordnung: `${c.invoices.length} Rechnungen: ${c.invoices
        .map((i) => i.number ?? '—')
        .join(', ')}`,
      score: `${Math.round(c.match.score * 100)} %`,
      grund: 'Sammelzahlung – Summe passt',
    })),
    ...receipts.map(({ s: r }) => ({
      art: (r.txBetragCents >= 0 ? 'Einnahme' : 'Ausgabe') as
        | 'Einnahme'
        | 'Ausgabe',
      datum: r.txDatum,
      beschreibung: r.txGegen ?? r.receiptHaendler ?? '',
      betrag: euro(r.txBetragCents),
      zuordnung: `Beleg ${r.receiptHaendler ?? '—'}${
        r.receiptBruttoCents != null ? ` · ${euro(r.receiptBruttoCents)}` : ''
      }`,
      score: `${Math.round(r.match.score * 100)} %`,
      grund: r.match.reason,
    })),
    ...missingReceipts.map(({ s: m }) => ({
      art: 'Ausgabe' as const,
      datum: m.txDatum,
      beschreibung: m.txGegen ?? m.txZweck ?? '',
      betrag: euro(m.txBetragCents),
      zuordnung: 'BELEG FEHLT',
      score: '—',
      grund: 'Kein passender Beleg gefunden – bitte hochladen',
    })),
    ...missingIncoming.map(({ s: m }) => ({
      art: 'Einnahme' as const,
      datum: m.txDatum,
      beschreibung: m.txGegen ?? m.txZweck ?? '',
      betrag: euro(m.txBetragCents),
      zuordnung: 'ZUORDNUNG FEHLT',
      score: '—',
      grund: 'Keine passende Rechnung/Beleg gefunden',
    })),
  ];

  const nowYear = new Date().getFullYear();
  const years = [nowYear + 1, nowYear, nowYear - 1, nowYear - 2, nowYear - 3];
  const firmaBase = `${basePath}&firma=${active.entity.id}`;
  const monthLabel = month >= 1 && month <= 12 ? `${MONTHS[month - 1]}-${year}` : `${year}`;
  // Preserve month/art in the rerun toggle so the view state is kept.
  const stateQuery = `&jahr=${year}&monat=${month}&art=${art}`;
  const toggleHref = weak
    ? `${firmaBase}${stateQuery}`
    : `${firmaBase}${stateQuery}&rerun=1`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CompanySwitcher
            companies={options}
            activeId={active.entity.id}
            basePath={basePath}
          />
          <MonthSwitcher
            year={year}
            month={month}
            years={years}
            basePath={firmaBase}
          />
          <KindFilter value={art} basePath={firmaBase} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportReconcileButton
            rows={exportRows}
            fileName={`abgleich-${active.entity.name}-${monthLabel}.csv`.replace(
              /\s+/g,
              '_',
            )}
          />
          <RunReconcileButton
            billingEntityId={active.entity.id}
            year={year}
            month={month}
          />
          <RerunReconcileButton
            billingEntityId={active.entity.id}
            year={year}
            month={month}
            rerunHref={toggleHref}
            active={weak}
          />
        </div>
      </div>

      {weak && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          🔁 Erneut-Modus aktiv: Es werden auch schwächere Treffer (ab 35 %)
          angezeigt, damit Buchungen unter 80 % noch einmal geprüft werden
          können. Prüfe die Vorschläge vor dem Übernehmen genau.
        </p>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Zahlungen ↔ Rechnungen{' '}
          <span className="text-muted-foreground">({payments.length})</span>
        </h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine offenen Vorschläge.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Zahlung</th>
                  <th className="px-3 py-2 font-medium">Rechnung</th>
                  <th className="px-3 py-2 font-medium">Grund</th>
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {payments.map(({ s: p, period }) => (
                  <tr key={`${p.match.leftId}-${p.match.rightId}`} className="border-t">
                    <td className="px-3 py-2">
                      {p.txGegen ?? '—'} · {formatEuroCents(p.txBetragCents)}
                      <div className="text-xs text-muted-foreground">
                        {p.txDatum}
                        <PeriodBadge period={period} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {p.invoiceNumber ?? '—'} · {p.invoiceKunde ?? '—'}
                      <div className="text-xs text-muted-foreground">
                        {formatEuroCents(p.invoiceGrossCents)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {p.match.reason}
                    </td>
                    <td className="px-3 py-2 text-right">{pct(p.match.score)}</td>
                    <td className="px-3 py-2 text-right">
                      <ApplyMatchButton
                        kind="payment"
                        transactionId={p.match.leftId}
                        invoiceId={p.match.rightId}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {combos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">
            Sammelzahlungen{' '}
            <span className="text-muted-foreground">({combos.length})</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Eine Zahlung deckt mehrere Rechnungen ab (Summe passt).
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Zahlung</th>
                  <th className="px-3 py-2 font-medium">Rechnungen</th>
                  <th className="px-3 py-2 text-right font-medium">Summe</th>
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {combos.map(({ s: c, period }) => (
                  <tr key={c.match.txId} className="border-t align-top">
                    <td className="px-3 py-2">
                      {c.txGegen ?? '—'} · {formatEuroCents(c.match.paymentCents)}
                      <div className="text-xs text-muted-foreground">
                        {c.txDatum}
                        <PeriodBadge period={period} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {c.invoices.map((inv) => (
                        <div key={inv.id} className="text-xs">
                          {inv.number ?? '—'} · {inv.kunde ?? '—'} ·{' '}
                          {formatEuroCents(inv.grossCents)}
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatEuroCents(c.match.totalCents)}
                    </td>
                    <td className="px-3 py-2 text-right">{pct(c.match.score)}</td>
                    <td className="px-3 py-2 text-right">
                      <ApplyComboButton
                        transactionId={c.match.txId}
                        invoiceIds={c.match.invoiceIds}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Belege ↔ Buchungen{' '}
          <span className="text-muted-foreground">({receipts.length})</span>
        </h2>
        {receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine offenen Vorschläge.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Beleg</th>
                  <th className="px-3 py-2 font-medium">Buchung</th>
                  <th className="px-3 py-2 font-medium">Grund</th>
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {receipts.map(({ s: r, period }) => (
                  <tr key={`${r.match.leftId}-${r.match.rightId}`} className="border-t">
                    <td className="px-3 py-2">
                      {r.receiptHaendler ?? '—'} ·{' '}
                      {r.receiptBruttoCents != null
                        ? formatEuroCents(r.receiptBruttoCents)
                        : '—'}
                      <div className="text-xs text-muted-foreground">
                        {r.receiptDatum ?? '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {r.txGegen ?? '—'} · {formatEuroCents(r.txBetragCents)}
                      <div className="text-xs text-muted-foreground">
                        {r.txDatum}
                        <PeriodBadge period={period} />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.match.reason}
                    </td>
                    <td className="px-3 py-2 text-right">{pct(r.match.score)}</td>
                    <td className="px-3 py-2 text-right">
                      <ApplyMatchButton
                        kind="receipt"
                        receiptId={r.match.leftId}
                        transactionId={r.match.rightId}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {missingReceipts.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-rose-600 dark:text-rose-400">
            ❓ Beleg fehlt{' '}
            <span className="text-muted-foreground">
              ({missingReceipts.length})
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Diese Ausgaben-Buchungen haben keinen passenden Beleg. Bitte den
            Beleg suchen und im Tab „Belege“ hochladen – danach „Erneut
            abgleichen“.
          </p>
          <div className="overflow-x-auto rounded-lg border border-rose-500/30">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Datum</th>
                  <th className="px-3 py-2 font-medium">Empfänger</th>
                  <th className="px-3 py-2 font-medium">Verwendungszweck</th>
                  <th className="px-3 py-2 text-right font-medium">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {missingReceipts.map(({ s: m, period }) => (
                  <tr key={m.txId} className="border-t">
                    <td className="whitespace-nowrap px-3 py-2">
                      {m.txDatum}
                      <PeriodBadge period={period} />
                    </td>
                    <td className="max-w-[16rem] truncate px-3 py-2" title={m.txGegen ?? ''}>
                      {m.txGegen ?? '—'}
                    </td>
                    <td
                      className="max-w-[24rem] truncate px-3 py-2 text-muted-foreground"
                      title={m.txZweck ?? ''}
                    >
                      {m.txZweck ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-red-600 dark:text-red-400">
                      {formatEuroCents(m.txBetragCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {missingIncoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
            ❓ Eingänge ohne Zuordnung{' '}
            <span className="text-muted-foreground">
              ({missingIncoming.length})
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Zu diesen Zahlungseingängen gibt es weder eine offene Rechnung noch
            einen Einnahme-Beleg. Rechnung/Beleg ergänzen oder manuell zuordnen.
          </p>
          <div className="overflow-x-auto rounded-lg border border-amber-500/30">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Datum</th>
                  <th className="px-3 py-2 font-medium">Zahler</th>
                  <th className="px-3 py-2 font-medium">Verwendungszweck</th>
                  <th className="px-3 py-2 text-right font-medium">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {missingIncoming.map(({ s: m, period }) => (
                  <tr key={m.txId} className="border-t">
                    <td className="whitespace-nowrap px-3 py-2">
                      {m.txDatum}
                      <PeriodBadge period={period} />
                    </td>
                    <td className="max-w-[16rem] truncate px-3 py-2" title={m.txGegen ?? ''}>
                      {m.txGegen ?? '—'}
                    </td>
                    <td
                      className="max-w-[24rem] truncate px-3 py-2 text-muted-foreground"
                      title={m.txZweck ?? ''}
                    >
                      {m.txZweck ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">
                      {formatEuroCents(m.txBetragCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
