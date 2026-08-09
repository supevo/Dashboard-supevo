import { redirect } from 'next/navigation';
import { Tabs, type TabDef } from '@/components/ui/tabs';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isSuperAdmin } from '@/lib/authz/policies';
import { ExpensesPanel } from '@/features/print-billing/components/expenses-panel';
import { BillingPanel } from '@/features/billing/components/billing-panel';
import { AccountingOverview } from '@/features/accounting/components/accounting-overview';
import { CompaniesPanel } from '@/features/accounting/components/companies-panel';
import { ReceiptsPanel } from '@/features/accounting/components/receipts-panel';
import { TransactionsPanel } from '@/features/accounting/components/transactions-panel';

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
  searchParams: Promise<{ tab?: string; month?: string; firma?: string }>;
}) {
  const { user, orgId } = await requireAgencyPage();
  if (!isSuperAdmin(user)) redirect('/app');

  const sp = await searchParams;
  const activeTab = sp.tab ?? 'uebersicht';

  const tabs: TabDef[] = [
    {
      key: 'uebersicht',
      label: '📊 Übersicht',
      content: <AccountingOverview orgId={orgId} />,
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
          basePath="/app/finance?tab=belege"
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
