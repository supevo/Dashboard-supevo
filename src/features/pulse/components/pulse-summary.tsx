import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { de } from '@/lib/i18n/de';
import type { PulseSummary } from '@/features/pulse/queries';

function moodEmoji(avg: number | null): string {
  if (avg === null) return '—';
  if (avg >= 2.5) return '😀';
  if (avg >= 1.75) return '😐';
  return '☹️';
}

/** Anonymous team-mood summary for leadership. Never shows individuals. */
export function PulseSummaryCard({ summary }: { summary: PulseSummary }) {
  const c = summary.current;
  const maxTrend = Math.max(1, ...summary.trend.map((w) => w.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{de.pulse.summaryTitle}</CardTitle>
        <p className="text-xs text-muted-foreground">{de.pulse.summaryHint}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-3xl">{moodEmoji(c.avg)}</span>
            <div>
              <div className="text-sm font-semibold">
                {c.avg ? c.avg.toFixed(2) : '—'} / 3
              </div>
              <div className="text-xs text-muted-foreground">
                {c.count} {de.pulse.responses}
              </div>
            </div>
          </div>
          <div className="flex gap-3 text-sm">
            <span>😀 {c.good}</span>
            <span>😐 {c.ok}</span>
            <span>☹️ {c.bad}</span>
          </div>
        </div>

        {/* 8-week trend as tiny bars */}
        <div className="flex items-end gap-1">
          {summary.trend.map((w) => (
            <div
              key={w.weekStart}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${w.weekStart}: ${w.count} (Ø ${w.avg ? w.avg.toFixed(1) : '—'})`}
            >
              <div
                className="w-full rounded-t bg-primary/60"
                style={{ height: `${8 + (w.count / maxTrend) * 40}px` }}
              />
            </div>
          ))}
        </div>

        {summary.comments.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {de.pulse.anonComments}
            </div>
            {summary.comments.map((c2, i) => (
              <div
                key={i}
                className="rounded-md bg-muted/40 px-2.5 py-1.5 text-sm"
              >
                „{c2}“
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
