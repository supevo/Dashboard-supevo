import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireClientPage } from '@/lib/authz/page-guards';
import { getMyClientCompany } from '@/features/satisfaction/queries';
import { listMarketingReports } from '@/features/marketing-reports/queries';
import { ReportCard } from '@/features/marketing-reports/components/report-card';
import { listMyTaskReports } from '@/features/task-reports/queries';
import { EmptyState } from '@/components/ui/empty-state';
import { formatBerlinDateTime } from '@/lib/time';
import { de } from '@/lib/i18n/de';

export default async function ClientReportsPage() {
  await requireClientPage();
  const company = await getMyClientCompany();
  const [reports, taskReports] = await Promise.all([
    company ? listMarketingReports(company.clientCompanyId) : Promise.resolve([]),
    listMyTaskReports(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{de.marketingReport.title}</h1>
        <p className="text-muted-foreground">{de.marketingReport.subtitle}</p>
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon="📊"
          title="Noch keine Berichte"
          description={de.marketingReport.empty}
        />
      ) : (
        <div className="space-y-4">
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} />
          ))}
        </div>
      )}

      {/* Einzelaufgabenberichte: die Updates, die wir bei erledigten Aufgaben
          gesendet haben. */}
      <div>
        <h2 className="text-xl font-bold">Einzelaufgabenberichte</h2>
        <p className="text-muted-foreground">
          Updates zu einzelnen, für Sie erledigten Aufgaben.
        </p>
      </div>

      {taskReports.length === 0 ? (
        <EmptyState
          icon="📝"
          title="Noch keine Einzelberichte"
          description="Updates zu einzelnen erledigten Aufgaben erscheinen hier."
        />
      ) : (
        <div className="space-y-3">
          {taskReports.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">✅ {t.taskTitle}</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {formatBerlinDateTime(t.createdAt)}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {t.message}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
