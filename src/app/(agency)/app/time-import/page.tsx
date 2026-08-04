import { redirect } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import { TimeImport } from '@/features/time-import/components/time-import';
import { isAiEnabled } from '@/lib/ai/complete';

export const dynamic = 'force-dynamic';

export default async function TimeImportPage() {
  const { user, orgId } = await requireAgencyPage();
  if (!isOrgAdmin(user, orgId)) redirect('/app');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stunden importieren</h1>
        <p className="text-sm text-muted-foreground">
          Arbeitszeiten aus einem anderen Tool (Excel) übernehmen – sie zählen
          danach zur Wochenarbeitszeit der Mitarbeiter.
          {isAiEnabled() ? '' : ' Hinweis: KI ist nicht aktiv, es wird ein einfacher Parser genutzt.'}
        </p>
      </div>
      <TimeImport />
    </div>
  );
}
