import { listAccountingCompanies } from '@/features/accounting/queries';
import {
  getReconcileSuggestions,
  classifyByMonth,
  type PeriodClass,
  type OpenBooking,
  type OpenReceipt,
  type ReceiptSuggestion,
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
  ApplyAllButton,
  ApplyMatchButton,
  ApplyComboButton,
  ApplySplitButton,
  ApplyReceiptComboButton,
} from '@/features/accounting/components/reconcile-buttons';
import { NoReceiptToggle } from '@/features/accounting/components/no-receipt-toggle';
import { ManualReceiptAssign } from '@/features/accounting/components/manual-receipt-assign';
import { kategorieLabel } from '@/features/accounting/categories';

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

/** True if two ISO dates fall in the same calendar month. */
function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** "Juni 2026" from an ISO date, for the cross-month hint. */
function monthYear(iso: string): string {
  const m = Number(iso.slice(5, 7));
  const y = iso.slice(0, 4);
  return m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${y}` : y;
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

/** Konfidenz as a percentage (handles both 0..1 and 0..100 stored values). */
function konfidenzPct(k: number | null): string | null {
  if (k == null) return null;
  const v = k <= 1 ? k * 100 : k;
  return `${Math.round(v)} %`;
}

/** Native <details> with the raw fields the KI scanned for this receipt, so the
 *  user can check what/where at a glance. No JS needed. */
function ScanDetails({ r }: { r: ReceiptSuggestion }) {
  const konf = konfidenzPct(r.receiptKonfidenz);
  const roh = r.receiptRohtext?.trim();
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-primary">
        ℹ️ Was die KI gescannt hat
      </summary>
      <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
        <div>
          <span className="font-medium">Beleg:</span>{' '}
          {r.receiptHaendler ?? '—'} · {r.receiptDatum ?? '—'} ·{' '}
          {r.receiptBruttoCents != null
            ? formatEuroCents(r.receiptBruttoCents)
            : '—'}
          {r.receiptWaehrung && r.receiptWaehrung.toUpperCase() !== 'EUR'
            ? ` · Währung ${r.receiptWaehrung} (Betrag im Original, Bankbetrag weicht durch Kurs ab)`
            : ''}
        </div>
        <div>
          <span className="font-medium">Rechnungsnr.:</span>{' '}
          {r.receiptRechnungsnummer ?? '—'}
          {konf ? ` · KI-Konfidenz ${konf}` : ''}
        </div>
        <div>
          <span className="font-medium">Buchung-Zweck:</span>{' '}
          {r.txZweck ?? '—'}
        </div>
        {roh && (
          <div className="whitespace-pre-wrap break-words">
            <span className="font-medium">Rohtext:</span>{' '}
            {roh.slice(0, 500)}
            {roh.length > 500 ? ' …' : ''}
          </div>
        )}
      </div>
    </details>
  );
}

/** Shared table for open bookings without a match ("Beleg fehlt" / "ohne
 *  Zuordnung"). One layout, parameterised by accent, peer label and amount sign. */
function MissingBookingsSection({
  title,
  description,
  accent,
  rows,
  peerLabel,
  amountPositive,
  withToggle,
  assignReceipts,
}: {
  title: string;
  description: string;
  accent: 'rose' | 'amber';
  rows: { s: OpenBooking; period: PeriodClass }[];
  peerLabel: string;
  amountPositive: boolean;
  withToggle: boolean;
  /** Offene Ausgabe-Belege zur MANUELLEN Zuordnung (nur „Beleg fehlt"). */
  assignReceipts?: { id: string; label: string }[];
}) {
  if (rows.length === 0) return null;
  const extraCol = withToggle || !!assignReceipts;
  const border = accent === 'rose' ? 'border-rose-500/30' : 'border-amber-500/30';
  const head =
    accent === 'rose'
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-amber-600 dark:text-amber-400';
  const amount = amountPositive
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-600 dark:text-red-400';
  return (
    <section className="space-y-2">
      <h2 className={`text-sm font-semibold ${head}`}>
        {title} <span className="text-muted-foreground">({rows.length})</span>
      </h2>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className={`overflow-x-auto rounded-lg border ${border}`}>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Datum</th>
              <th className="px-3 py-2 font-medium">{peerLabel}</th>
              <th className="px-3 py-2 font-medium">Verwendungszweck</th>
              <th className="px-3 py-2 text-right font-medium">Betrag</th>
              {extraCol && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s: m, period }) => (
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
                <td
                  className={`whitespace-nowrap px-3 py-2 text-right font-medium ${amount}`}
                >
                  {formatEuroCents(m.txBetragCents)}
                </td>
                {extraCol && (
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {assignReceipts && (
                        <ManualReceiptAssign
                          transactionId={m.txId}
                          receipts={assignReceipts}
                        />
                      )}
                      {withToggle && (
                        <NoReceiptToggle transactionId={m.txId} value={false} />
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Table of documents (invoices/receipts) that have NO matching bank booking:
 *  "Ausgangsrechnungen ohne Zahlungseingang" / "Eingangsrechnungen ohne
 *  Zahlung". Columns: Datum, Händler, Rechnungsnr., Betrag. */
function UnpaidReceiptsSection({
  title,
  description,
  accent,
  rows,
}: {
  title: string;
  description: string;
  accent: 'emerald' | 'red';
  rows: { s: OpenReceipt; period: PeriodClass }[];
}) {
  if (rows.length === 0) return null;
  const border =
    accent === 'emerald' ? 'border-emerald-500/30' : 'border-red-500/30';
  const head =
    accent === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-600 dark:text-red-400';
  return (
    <section className="space-y-2">
      <h2 className={`text-sm font-semibold ${head}`}>
        {title} <span className="text-muted-foreground">({rows.length})</span>
      </h2>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className={`overflow-x-auto rounded-lg border ${border}`}>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Datum</th>
              <th className="px-3 py-2 font-medium">Händler / Kunde</th>
              <th className="px-3 py-2 font-medium">Rechnungsnr.</th>
              <th className="px-3 py-2 text-right font-medium">Betrag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s: r, period }) => (
              <tr key={r.receiptId} className="border-t">
                <td className="whitespace-nowrap px-3 py-2">
                  {r.datum ?? '—'}
                  <PeriodBadge period={period} />
                </td>
                <td
                  className="max-w-[20rem] truncate px-3 py-2"
                  title={r.haendler ?? ''}
                >
                  {r.haendler ?? '—'}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.rechnungsnummer ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                  {r.bruttoCents != null ? formatEuroCents(r.bruttoCents) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Abgleich tab: shows the reconcile suggestions for manual confirmation. Nothing
 * is booked automatically – every match is applied by hand (per row or via „Alle
 * sicheren übernehmen"). The month picker limits the view to the selected month
 * plus a ±3-day fringe; fringe bookings are flagged.
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
  const splits = wantOut ? [] : inView(all.splits);
  // Beleg-Sammlungen sind immer Ausgänge (mehrere Belege → eine Abbuchung).
  const receiptCombos = wantIn ? [] : inView(all.receiptCombos);
  const receipts = inView(all.receipts).filter(({ s }) =>
    wantIn ? s.txBetragCents > 0 : wantOut ? s.txBetragCents < 0 : true,
  );
  // "Beleg fehlt" / "Zuordnung fehlt" – open bookings with no match at all.
  const missingReceipts = wantIn ? [] : inView(all.missingReceipts);
  const missingIncoming = wantOut ? [] : inView(all.missingIncoming);
  // Ausgeklammerte Kategorien (nicht im Abgleich, aber im CSV separat).
  const excluded = inView(all.excluded).filter(({ s }) =>
    wantIn ? s.txBetragCents > 0 : wantOut ? s.txBetragCents < 0 : true,
  );
  // Belege ohne passende Zahlung. Ausgangsrechnungen (Einnahme) verstecken wir
  // im Ausgaben-Filter, Eingangsrechnungen (Ausgabe) im Einnahmen-Filter.
  const unpaidOutgoing = wantOut ? [] : inView(all.unpaidOutgoing);
  const unpaidIncoming = wantIn ? [] : inView(all.unpaidIncoming);
  const openCount =
    missingReceipts.length +
    missingIncoming.length +
    unpaidOutgoing.length +
    unpaidIncoming.length;
  // Kandidaten für die MANUELLE Beleg-Zuordnung: alle offenen Ausgabe-Belege
  // (monatsübergreifend), damit auch eine falsch erkannte/Fremdwährungs-Rechnung
  // von Hand einer Buchung zugewiesen werden kann.
  const assignCandidates = all.unpaidIncoming.map((r) => ({
    id: r.receiptId,
    label: `${r.haendler ?? '—'} · ${r.datum ?? '—'}${
      r.bruttoCents != null ? ` · ${formatEuroCents(r.bruttoCents)}` : ''
    }`,
  }));

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
    ...splits.map(({ s: sp }) => ({
      art: 'Einnahme' as const,
      datum: sp.txDatum,
      beschreibung: sp.payments[0]?.gegen ?? sp.invoiceKunde ?? '',
      betrag: euro(sp.match.paidCents),
      zuordnung: `Rechnung ${sp.invoiceNumber ?? '—'} · ${
        sp.payments.length
      } Teilzahlungen`,
      score: `${Math.round(sp.match.score * 100)} %`,
      grund: sp.match.reason,
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
    ...receiptCombos.map(({ s: rc }) => ({
      art: 'Ausgabe' as const,
      datum: rc.txDatum,
      beschreibung: rc.txGegen ?? '',
      betrag: euro(rc.txBetragCents),
      zuordnung: `${rc.receipts.length} Belege: ${rc.receipts
        .map((x) => x.haendler ?? '—')
        .join(', ')}`,
      score: `${Math.round(rc.match.score * 100)} %`,
      grund: rc.match.reason,
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
    ...unpaidOutgoing.map(({ s: r }) => ({
      art: 'Einnahme' as const,
      datum: r.datum ?? '',
      beschreibung: r.haendler ?? '',
      betrag: r.bruttoCents != null ? euro(r.bruttoCents) : '',
      zuordnung: `AUSGANGSRECHNUNG OHNE ZAHLUNGSEINGANG${
        r.rechnungsnummer ? ` · Nr. ${r.rechnungsnummer}` : ''
      }`,
      score: '—',
      grund: 'Gestellte Rechnung noch nicht bezahlt – kein Bankeingang gefunden',
    })),
    ...unpaidIncoming.map(({ s: r }) => ({
      art: 'Ausgabe' as const,
      datum: r.datum ?? '',
      beschreibung: r.haendler ?? '',
      betrag: r.bruttoCents != null ? euro(r.bruttoCents) : '',
      zuordnung: `EINGANGSRECHNUNG OHNE ZAHLUNG${
        r.rechnungsnummer ? ` · Nr. ${r.rechnungsnummer}` : ''
      }`,
      score: '—',
      grund: 'Lieferantenrechnung noch nicht bezahlt – keine Zahlung gefunden',
    })),
    // Ausgeklammerte Kategorien – separat am Ende, mit Steuerberater-Hinweis.
    ...excluded.map(({ s: e }) => ({
      art: (e.txBetragCents >= 0 ? 'Einnahme' : 'Ausgabe') as
        | 'Einnahme'
        | 'Ausgabe',
      datum: e.txDatum,
      beschreibung: e.txGegen ?? e.txZweck ?? '',
      betrag: euro(e.txBetragCents),
      zuordnung: `AUSGEKLAMMERT · ${kategorieLabel(e.kategorieId)}`,
      score: '—',
      grund: 'Liegt dem Steuerberater vor – separat, nicht im Abgleich',
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
          <ApplyAllButton
            billingEntityId={active.entity.id}
            year={year}
            month={month}
          />
          <RerunReconcileButton rerunHref={toggleHref} active={weak} />
        </div>
      </div>

      {weak && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          🔁 Erneut-Modus aktiv: Es werden auch schwächere Treffer (ab 35 %)
          angezeigt, damit Buchungen unter 80 % noch einmal geprüft werden
          können. Prüfe die Vorschläge vor dem Übernehmen genau.
        </p>
      )}

      <div>
        <h2 className="text-base font-semibold">Vorschläge zum Bestätigen</h2>
        <p className="text-xs text-muted-foreground">
          Zuordnungen, die der Abgleich gefunden hat – nichts wird automatisch
          gebucht, erst mit „Übernehmen“.
        </p>
      </div>

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
                        {p.invoiceIssueDate &&
                        !sameMonth(p.invoiceIssueDate, p.txDatum) ? (
                          <span className="ml-2 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">
                            Rechnung aus {monthYear(p.invoiceIssueDate)}
                          </span>
                        ) : null}
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

      {splits.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">
            Teilzahlungen{' '}
            <span className="text-muted-foreground">({splits.length})</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Eine Rechnung (Gesamtbetrag) wurde in mehreren Zahlungen beglichen –
            die Summe der Zahlungen ergibt den Rechnungsbetrag.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Rechnung</th>
                  <th className="px-3 py-2 font-medium">Zahlungen</th>
                  <th className="px-3 py-2 text-right font-medium">Summe</th>
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {splits.map(({ s: sp, period }) => (
                  <tr key={sp.match.invoiceId} className="border-t align-top">
                    <td className="px-3 py-2">
                      {sp.invoiceNumber ?? '—'} · {sp.invoiceKunde ?? '—'}
                      <div className="text-xs text-muted-foreground">
                        {formatEuroCents(sp.invoiceGrossCents)}
                        <PeriodBadge period={period} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {sp.payments.map((p) => (
                        <div key={p.id} className="text-xs">
                          {p.datum} · {p.gegen ?? '—'} ·{' '}
                          {formatEuroCents(p.betragCents)}
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatEuroCents(sp.match.paidCents)}
                    </td>
                    <td className="px-3 py-2 text-right">{pct(sp.match.score)}</td>
                    <td className="px-3 py-2 text-right">
                      <ApplySplitButton
                        invoiceId={sp.match.invoiceId}
                        transactionIds={sp.match.txIds}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {receiptCombos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">
            Beleg-Sammlungen{' '}
            <span className="text-muted-foreground">({receiptCombos.length})</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Eine Abbuchung deckt mehrere Belege ab (z. B. ein Amazon-PDF mit
            mehreren Seiten) – die Summe der Belege ergibt den Zahlbetrag.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Zahlung</th>
                  <th className="px-3 py-2 font-medium">Belege</th>
                  <th className="px-3 py-2 text-right font-medium">Summe</th>
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {receiptCombos.map(({ s: rc, period }) => (
                  <tr key={rc.match.txId} className="border-t align-top">
                    <td className="px-3 py-2">
                      {rc.txGegen ?? '—'} · {formatEuroCents(rc.txBetragCents)}
                      <div className="text-xs text-muted-foreground">
                        {rc.txDatum}
                        <PeriodBadge period={period} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {rc.receipts.map((r) => (
                        <div key={r.id} className="text-xs">
                          {r.datum ?? '—'} · {r.haendler ?? '—'} ·{' '}
                          {r.bruttoCents != null
                            ? formatEuroCents(r.bruttoCents)
                            : '—'}
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatEuroCents(rc.match.totalCents)}
                    </td>
                    <td className="px-3 py-2 text-right">{pct(rc.match.score)}</td>
                    <td className="px-3 py-2 text-right">
                      <ApplyReceiptComboButton
                        transactionId={rc.match.txId}
                        receiptIds={rc.match.receiptIds}
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
                      <ScanDetails r={r} />
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

      {openCount > 0 && (
        <details className="rounded-lg border bg-muted/20 open:pb-2">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
            Offene Posten & Hinweise{' '}
            <span className="text-muted-foreground">({openCount})</span>
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              – nichts zu bestätigen, nur zur Übersicht (fehlende Belege,
              unbezahlte Rechnungen …)
            </span>
          </summary>
          <div className="space-y-6 px-3 pt-2">
            <MissingBookingsSection
              title="❓ Beleg fehlt"
              description="Diese Ausgaben-Buchungen haben keinen passenden Beleg. Beleg im Tab „Belege“ hochladen – oder rechts einen bereits vorhandenen Beleg manuell zuordnen (z. B. bei falsch erkannter Währung/Betrag)."
              accent="rose"
              rows={missingReceipts}
              peerLabel="Empfänger"
              amountPositive={false}
              withToggle
              assignReceipts={assignCandidates}
            />

            <MissingBookingsSection
              title="❓ Eingänge ohne Zuordnung"
              description="Zu diesen Zahlungseingängen gibt es weder eine offene Rechnung noch einen Einnahme-Beleg. Rechnung/Beleg ergänzen oder manuell zuordnen."
              accent="amber"
              rows={missingIncoming}
              peerLabel="Zahler"
              amountPositive
              withToggle={false}
            />

            <UnpaidReceiptsSection
              title="📤 Ausgangsrechnungen ohne Zahlungseingang"
              description="Von dir gestellte Rechnungen / Einnahme-Belege, zu denen der Abgleich noch keinen passenden Bankeingang gefunden hat – vermutlich noch offen (nicht bezahlt)."
              accent="emerald"
              rows={unpaidOutgoing}
            />

            <UnpaidReceiptsSection
              title="📥 Eingangsrechnungen ohne Zahlung"
              description="Lieferantenrechnungen / Ausgabe-Belege, zu denen keine passende Bankzahlung gefunden wurde – vermutlich noch nicht bezahlt."
              accent="red"
              rows={unpaidIncoming}
            />
          </div>
        </details>
      )}
    </div>
  );
}
