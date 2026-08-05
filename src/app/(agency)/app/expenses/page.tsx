import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isSuperAdmin } from '@/lib/authz/policies';
import { listPrintExpenses, sumExpenseCents } from '@/features/print-billing/queries';
import { DeleteExpenseButton } from '@/features/print-billing/components/delete-expense-button';

function euro(cents: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}
function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('de-DE', {
    month: 'long',
    year: 'numeric',
  });
}

/** Internal expenses area (super-admin only): supplier invoices for print jobs. */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { user, orgId } = await requireAgencyPage();
  if (!isSuperAdmin(user)) redirect('/app');

  const { month } = await searchParams;
  const all = await listPrintExpenses(orgId);
  const months = [...new Set(all.map((e) => monthKey(e.createdAt)))].sort().reverse();
  const activeMonth = month && months.includes(month) ? month : null;
  const expenses = activeMonth
    ? all.filter((e) => monthKey(e.createdAt) === activeMonth)
    : all;
  const total = sumExpenseCents(expenses);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">💶 Ausgaben</h1>
          <p className="text-sm text-muted-foreground">
            Hochgeladene Dienstleister-Rechnungen für abgerechnete Druckprodukte.
          </p>
        </div>
        <a
          href="/api/print-expenses/export"
          className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          ⬇️ CSV-Export
        </a>
      </div>

      {months.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href="/app/expenses"
            className={`rounded-full border px-3 py-1 ${!activeMonth ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}`}
          >
            Alle
          </Link>
          {months.map((mk) => (
            <Link
              key={mk}
              href={`/app/expenses?month=${mk}`}
              className={`rounded-full border px-3 py-1 ${activeMonth === mk ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}`}
            >
              {monthLabel(mk)}
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Drucksachen-Rechnungen ({expenses.length}){' '}
            {total > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                · {activeMonth ? monthLabel(activeMonth) + ': ' : 'erfasst '}
                {euro(total)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Ausgaben erfasst.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 text-left">Datum</th>
                    <th className="py-2 text-left">Kunde</th>
                    <th className="py-2 text-left">Aufgabe</th>
                    <th className="py-2 text-left">Dienstleister</th>
                    <th className="py-2 text-right">Betrag</th>
                    <th className="py-2 text-left">Hochgeladen von</th>
                    <th className="py-2 text-right">Datei</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2 whitespace-nowrap">
                        {new Date(e.createdAt).toLocaleDateString('de-DE')}
                      </td>
                      <td className="py-2">{e.clientName ?? '—'}</td>
                      <td className="py-2">
                        {e.taskTitle ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2">{e.supplier ?? '—'}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {e.amountCents != null ? euro(e.amountCents) : '—'}
                      </td>
                      <td className="py-2">{e.uploadedByName ?? '—'}</td>
                      <td className="py-2 text-right">
                        <Link
                          href={`/api/print-expenses/${e.id}/download`}
                          className="text-primary hover:underline"
                        >
                          📄 Öffnen
                        </Link>
                      </td>
                      <td className="py-2 text-right">
                        <DeleteExpenseButton expenseId={e.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
