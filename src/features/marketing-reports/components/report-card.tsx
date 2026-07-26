import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MarketingReport } from '@/features/marketing-reports/queries';
import { de } from '@/lib/i18n/de';

function Section({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

/** Read-only rendering of a single marketing report (portal + agency preview). */
export function ReportCard({ report }: { report: MarketingReport }) {
  const empty =
    !report.ranking &&
    !report.sea &&
    !report.inquiries &&
    !report.summary &&
    report.screenshots.length === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{report.periodLabel}</CardTitle>
          {!report.published && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              {de.marketingReport.draft}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {report.summary && (
          <p className="whitespace-pre-wrap text-sm">{report.summary}</p>
        )}
        <Section title={de.marketingReport.ranking} body={report.ranking} />
        <Section title={de.marketingReport.sea} body={report.sea} />
        <Section title={de.marketingReport.inquiries} body={report.inquiries} />

        {report.screenshots.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">{de.marketingReport.screenshots}</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {report.screenshots.map((s, i) => (
                <figure key={i} className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.url}
                    alt={s.caption ?? `Screenshot ${i + 1}`}
                    className="w-full rounded-md border"
                    loading="lazy"
                  />
                  {s.caption && (
                    <figcaption className="text-xs text-muted-foreground">
                      {s.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>
        )}

        {empty && (
          <p className="text-sm text-muted-foreground">{de.marketingReport.noContent}</p>
        )}
      </CardContent>
    </Card>
  );
}
