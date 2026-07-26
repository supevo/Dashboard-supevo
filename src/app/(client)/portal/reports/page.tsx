import { requireClientPage } from '@/lib/authz/page-guards';
import { getMyClientCompany } from '@/features/satisfaction/queries';
import { listMarketingReports } from '@/features/marketing-reports/queries';
import { ReportCard } from '@/features/marketing-reports/components/report-card';
import { de } from '@/lib/i18n/de';

export default async function ClientReportsPage() {
  await requireClientPage();
  const company = await getMyClientCompany();
  const reports = company
    ? await listMarketingReports(company.clientCompanyId)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{de.marketingReport.title}</h1>
        <p className="text-muted-foreground">{de.marketingReport.subtitle}</p>
      </div>

      {reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">{de.marketingReport.empty}</p>
      ) : (
        <div className="space-y-4">
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} />
          ))}
        </div>
      )}
    </div>
  );
}
