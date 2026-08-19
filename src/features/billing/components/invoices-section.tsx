'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  createDraftInvoiceAction,
  invoiceOpAction,
  setInvoiceRecipientAction,
} from '@/features/billing/invoice-actions';
import { idleResult } from '@/lib/action-result';
import { formatEuroCents } from '@/lib/money';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
              <SubmitButton name="op" value="send" size="sm">
                📧 Absenden
              </SubmitButton>
              {invoice.status === 'finalized' && (
                <SubmitButton name="op" value="sent" size="sm" variant="ghost">
                  Nur als versendet markieren
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
      {state.status === 'success' && state.message && (
        <Alert variant="success">{state.message}</Alert>
      )}
    </div>
  );
}

function RecipientForm({
  clientCompanyId,
  recipientEmail,
}: {
  clientCompanyId: string;
  recipientEmail: string | null;
}) {
  const [state, formAction] = useActionState(setInvoiceRecipientAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);
  return (
    <form action={formAction} className="space-y-1 rounded-lg border p-3">
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      <Label htmlFor="invoice-recipient">Rechnungsempfänger (E-Mail)</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="invoice-recipient"
          name="email"
          type="email"
          defaultValue={recipientEmail ?? ''}
          placeholder="rechnung@kunde.de"
          className="h-9 max-w-xs"
        />
        <SubmitButton size="sm" variant="outline">
          Speichern
        </SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        An diese Adresse geht die Rechnung beim Klick auf „Absenden“. Leer =
        allgemeine Kontakt-E-Mail des Kunden.
      </p>
      {state.status === 'error' && (
        <Alert variant="destructive" className="text-xs">
          {state.message}
        </Alert>
      )}
      {state.status === 'success' && state.message && (
        <Alert variant="success" className="text-xs">
          {state.message}
        </Alert>
      )}
    </form>
  );
}

export function InvoicesSection({
  clientCompanyId,
  invoices,
  recipientEmail,
}: {
  clientCompanyId: string;
  invoices: InvoiceRow[];
  recipientEmail: string | null;
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
      <RecipientForm clientCompanyId={clientCompanyId} recipientEmail={recipientEmail} />

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
