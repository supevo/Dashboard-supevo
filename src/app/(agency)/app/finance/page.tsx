import { redirect } from 'next/navigation';
import { Tabs, type TabDef } from '@/components/ui/tabs';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isSuperAdmin } from '@/lib/authz/policies';
import { ExpensesPanel } from '@/features/print-billing/components/expenses-panel';
import { BillingPanel } from '@/features/billing/components/billing-panel';
import { OverviewPanel } from '@/features/accounting/components/overview-panel';
import { MonthClosePanel } from '@/features/accounting/components/month-close-panel';
import { CompaniesPanel } from '@/features/accounting/components/companies-panel';
import { ReceiptsPanel } from '@/features/accounting/components/receipts-panel';
import { TransactionsPanel } from '@/features/accounting/components/transactions-panel';
import { ReconcilePanel } from '@/features/accounting/components/reconcile-panel';
import { TaxPanel } from '@/features/accounting/components/tax-panel';

export const dynamic = 'force-dynamic';

/**
 * Finanzen – the money area (Ressourcen), super-admin only. Bundles the new
 * accounting module (Übersicht, Firmen) with the existing Ausgaben (supplier
 * print invoices) and Rechnungen (billing entities + SEPA export). The
 * accounting companies ARE the billing entities, so both are coupled here.
 */
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    month?: string;
    firma?: string;
    jahr?: string;
    monat?: string;
  }>;
}) {
  const { user, orgId } = await requireAgencyPage();
  if (!isSuperAdmin(user)) redirect('/app');

  const sp = await searchParams;
  const activeTab = sp.tab ?? 'uebersicht';
  const jahr = Number(sp.jahr) || new Date().getFullYear();
  const monat = Number(sp.monat) || new Date().getMonth() + 1;
  // Umsätze/Belege lists default to "Alle Monate" (0) so nothing is hidden.
  const monatListe = Number(sp.monat) || 0;

  const tabs: TabDef[] = [
    {
      key: 'uebersicht',
      label: '📊 Übersicht',
      content: (
        <OverviewPanel
          orgId={orgId}
          activeFirma={sp.firma}
          year={jahr}
          basePath="/app/finance?tab=uebersicht"
        />
      ),
    },
    {
      key: 'monatsabschluss',
      label: '📅 Monatsabschluss',
      content: (
        <MonthClosePanel
          orgId={orgId}
          activeFirma={sp.firma}
          year={jahr}
          month={monat}
          basePath="/app/finance?tab=monatsabschluss"
        />
      ),
    },
    {
      key: 'firmen',
      label: '🏢 Firmen',
      content: (
        <CompaniesPanel
          orgId={orgId}
          activeFirma={sp.firma}
          basePath="/app/finance?tab=firmen"
        />
      ),
    },
    {
      key: 'umsaetze',
      label: '💳 Umsätze',
      content: (
        <TransactionsPanel
          orgId={orgId}
          activeFirma={sp.firma}
          year={jahr}
          month={monatListe}
          basePath="/app/finance?tab=umsaetze"
        />
      ),
    },
    {
      key: 'belege',
      label: '🧾 Belege',
      content: (
        <ReceiptsPanel
          orgId={orgId}
          activeFirma={sp.firma}
          year={jahr}
          month={monatListe}
          basePath="/app/finance?tab=belege"
        />
      ),
    },
    {
      key: 'abgleich',
      label: '🔗 Abgleich',
      content: (
        <ReconcilePanel
          orgId={orgId}
          activeFirma={sp.firma}
          year={jahr}
          basePath="/app/finance?tab=abgleich"
        />
      ),
    },
    {
      key: 'steuer',
      label: '📈 Steuer',
      content: (
        <TaxPanel
          orgId={orgId}
          activeFirma={sp.firma}
          year={jahr}
          basePath="/app/finance?tab=steuer"
        />
      ),
    },
    {
      key: 'ausgaben',
      label: '💶 Drucksachen',
      content: (
        <ExpensesPanel
          orgId={orgId}
          monthParam={sp.month}
          basePath="/app/finance?tab=ausgaben"
          monthHrefPrefix="/app/finance?tab=ausgaben&month="
        />
      ),
    },
    {
      key: 'rechnungen',
      label: '🧾 Rechnungen',
      content: <BillingPanel orgId={orgId} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Finanzen</h1>
        <p className="text-sm text-muted-foreground">
          Buchhaltung, Firmen, Ausgaben und Rechnungen an einem Ort – getrennte
          Bücher je Firma (z. B. supevo GmbH und ONE STEP).
        </p>
      </div>
      <Tabs tabs={tabs} initialKey={activeTab} />
    </div>
  );
}
