import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { requireClientPage } from '@/lib/authz/page-guards';
import { listPortalInvoices } from '@/features/billing/invoice-queries';
import { formatEuroCents } from '@/lib/money';

const STATUS_LABEL: Record<string, string> = {
  finalized: 'Offen',
  sent: 'Versendet',
  paid: 'Bezahlt',
  void: 'Storniert',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export default async function PortalInvoicesPage() {
  await requireClientPage();
  const invoices = await listPortalInvoices();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Rechnungen</h1>

      <Card>
        <CardHeader>
          <CardTitle>Ihre Rechnungen</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Es liegen noch keine Rechnungen vor.
            </p>
          ) : (
            <ul className="divide-y">
              {invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <div className="font-medium">
                      {inv.invoice_number ?? '—'}
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Datum {fmtDate(inv.issue_date)} · Zeitraum{' '}
                      {fmtDate(inv.service_period_start)}–
                      {fmtDate(inv.service_period_end)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">
                      {formatEuroCents(inv.gross_cents)}
                    </span>
                    {inv.pdf_path && (
                      <a
                        href={`/api/invoices/${inv.id}/pdf?dl=1`}
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        PDF herunterladen
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
