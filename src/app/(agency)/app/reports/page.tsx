import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { getTimeReport, type ReportRow } from '@/features/reports/queries';
import { formatMinutes } from '@/lib/time';
import { de } from '@/lib/i18n/de';

function ReportTable({ rows }: { rows: ReportRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Daten im Zeitraum.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2">Name</th>
            <th className="py-2 text-right">Gesamt</th>
            <th className="py-2 text-right">Abrechenbar</th>
            <th className="py-2 text-right">Nicht abr.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b last:border-0">
              <td className="py-2">{r.label}</td>
              <td className="py-2 text-right font-medium">
                {formatMinutes(r.minutes)}
              </td>
              <td className="py-2 text-right text-muted-foreground">
                {formatMinutes(r.billableMinutes)}
              </td>
              <td className="py-2 text-right text-muted-foreground">
                {formatMinutes(r.nonBillableMinutes)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ReportsPage() {
  await requireAgencyPage();
  // Last 30 days.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const report = await getTimeReport(since);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{de.nav.reports}</h1>
        <p className="text-sm text-muted-foreground">Letzte 30 Tage</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-2xl font-bold">
            {formatMinutes(report.totalMinutes)}
          </div>
          <div className="text-xs text-muted-foreground">Gesamt</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-2xl font-bold">
            {formatMinutes(report.billableMinutes)}
          </div>
          <div className="text-xs text-muted-foreground">Abrechenbar</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-2xl font-bold">
            {formatMinutes(report.nonBillableMinutes)}
          </div>
          <div className="text-xs text-muted-foreground">Nicht abrechenbar</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nach Projekt</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportTable rows={report.byProject} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nach Kunde</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportTable rows={report.byClient} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nach Mitarbeiter</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportTable rows={report.byMember} />
        </CardContent>
      </Card>
    </div>
  );
}
