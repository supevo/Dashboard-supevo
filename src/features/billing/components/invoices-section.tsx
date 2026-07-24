'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  createDraftInvoiceAction,
  invoiceOpAction,
} from '@/features/billing/invoice-actions';
import { idleResult } from '@/lib/action-result';
import { formatEuroCents } from '@/lib/money';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { Button } from '@/components/ui/button';
import type { InvoiceRow } from '@/features/billing/invoice-queries';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf',
  finalized: 'Finalisiert',
  sent: 'Versendet',
  paid: 'Bezahlt',
  void: 'Storniert',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function InvoiceRowActions({ invoice }: { invoice: InvoiceRow }) {
  const [state, formAction] = useActionState(invoiceOpAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {invoice.pdf_path && (
          <>
            <a
              href={`/api/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              <Button type="button" variant="outline" size="sm">
                PDF ansehen
              </Button>
            </a>
            <a href={`/api/invoices/${invoice.id}/pdf?dl=1`}>
              <Button type="button" variant="ghost" size="sm">
                Herunterladen
              </Button>
            </a>
          </>
        )}
        <form action={formAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="invoiceId" value={invoice.id} />
          {invoice.status === 'draft' && (
            <SubmitButton name="op" value="finalize" size="sm">
              Finalisieren
            </SubmitButton>
          )}
          {(invoice.status === 'finalized' || invoice.status === 'sent') && (
            <>
              {invoice.status === 'finalized' && (
                <SubmitButton name="op" value="sent" size="sm" variant="outline">
                  Als versendet markieren
                </SubmitButton>
              )}
              <SubmitButton name="op" value="paid" size="sm" variant="outline">
                Als bezahlt markieren
              </SubmitButton>
            </>
          )}
          {invoice.status === 'draft' && (
            <SubmitButton name="op" value="void" size="sm" variant="ghost">
              Verwerfen
            </SubmitButton>
          )}
        </form>
      </div>
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
    </div>
  );
}

export function InvoicesSection({
  clientCompanyId,
  invoices,
}: {
  clientCompanyId: string;
  invoices: InvoiceRow[];
}) {
  const [state, formAction] = useActionState(
    createDraftInvoiceAction,
    idleResult,
  );
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
        {state.status === 'error' && (
          <Alert variant="destructive">{state.message}</Alert>
        )}
        {state.status === 'success' && <Alert>{state.message}</Alert>}
        <SubmitButton size="sm">Rechnungsentwurf erstellen</SubmitButton>
      </form>

      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Rechnungen.</p>
      ) : (
        <ul className="divide-y">
          {invoices.map((inv) => (
            <li key={inv.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-medium">
                    {inv.invoice_number ?? 'Entwurf'}
                  </span>
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {STATUS_LABEL[inv.status] ?? inv.status}
                  </span>
                  <div className="text-xs text-muted-foreground">
                    Zeitraum {fmtDate(inv.service_period_start)}–
                    {fmtDate(inv.service_period_end)}
                    {inv.issue_date ? ` · Datum ${fmtDate(inv.issue_date)}` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">
                    {formatEuroCents(inv.gross_cents)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    inkl. {formatEuroCents(inv.tax_cents)} USt
                  </div>
                </div>
              </div>
              <InvoiceRowActions invoice={inv} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
