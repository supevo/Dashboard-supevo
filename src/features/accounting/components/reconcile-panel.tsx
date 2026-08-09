import { listAccountingCompanies } from '@/features/accounting/queries';
import { getReconcileSuggestions } from '@/features/accounting/reconcile-queries';
import { formatEuroCents } from '@/lib/money';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CompanySwitcher,
  type CompanyOption,
} from '@/features/accounting/components/company-switcher';
import {
  RunReconcileButton,
  ApplyMatchButton,
  ApplyComboButton,
} from '@/features/accounting/components/reconcile-buttons';

function pct(score: number): string {
  return `${Math.round(score * 100)} %`;
}

/**
 * Abgleich tab: run the reconcile engine (auto-applies confident matches) and
 * confirm the remaining suggestions – payments ↔ open invoices and receipts ↔
 * outgoing transactions.
 */
export async function ReconcilePanel({
  orgId,
  activeFirma,
  year,
  basePath,
}: {
  orgId: string;
  activeFirma?: string;
  year: number;
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

  const { payments, receipts, combos } = await getReconcileSuggestions(
    active.entity.id,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CompanySwitcher
          companies={options}
          activeId={active.entity.id}
          basePath={basePath}
        />
        <RunReconcileButton billingEntityId={active.entity.id} year={year} />
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
                {payments.map((p) => (
                  <tr key={`${p.match.leftId}-${p.match.rightId}`} className="border-t">
                    <td className="px-3 py-2">
                      {p.txGegen ?? '—'} · {formatEuroCents(p.txBetragCents)}
                      <div className="text-xs text-muted-foreground">{p.txDatum}</div>
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
                {combos.map((c) => (
                  <tr key={c.match.txId} className="border-t align-top">
                    <td className="px-3 py-2">
                      {c.txGegen ?? '—'} · {formatEuroCents(c.match.paymentCents)}
                      <div className="text-xs text-muted-foreground">{c.txDatum}</div>
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
                {receipts.map((r) => (
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
                      <div className="text-xs text-muted-foreground">{r.txDatum}</div>
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
    </div>
  );
}
