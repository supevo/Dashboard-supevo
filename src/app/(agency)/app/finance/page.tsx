import { redirect } from 'next/navigation';
import { Tabs, type TabDef } from '@/components/ui/tabs';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isSuperAdmin } from '@/lib/authz/policies';
import { ExpensesPanel } from '@/features/print-billing/components/expenses-panel';
import { BillingPanel } from '@/features/billing/components/billing-panel';

export const dynamic = 'force-dynamic';

/**
 * Finanzen – the money area (Ressourcen), super-admin only. Bundles Ausgaben
 * (supplier print invoices) and Rechnungen (billing entities + SEPA export).
 * Groundwork for the dedicated finance module planned next.
 */
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  const { user, orgId } = await requireAgencyPage();
  if (!isSuperAdmin(user)) redirect('/app');

  const sp = await searchParams;
  const activeTab = sp.tab ?? 'ausgaben';

  const tabs: TabDef[] = [
    {
      key: 'ausgaben',
      label: '💶 Ausgaben',
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
          Ausgaben und Rechnungen an einem Ort – Basis für das kommende
          Finanzmodul.
        </p>
      </div>
      <Tabs tabs={tabs} initialKey={activeTab} />
    </div>
  );
}
