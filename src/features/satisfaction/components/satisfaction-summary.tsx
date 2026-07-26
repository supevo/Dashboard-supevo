import { de } from '@/lib/i18n/de';
import type { SatisfactionSummary } from '@/features/satisfaction/queries';

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500" aria-label={`${rating} von 5`}>
      {'★'.repeat(rating)}
      <span className="text-muted-foreground/30">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

/** Agency-side read-only summary of a client's satisfaction. */
export function SatisfactionSummaryCard({ summary }: { summary: SatisfactionSummary }) {
  if (summary.count === 0) {
    return <p className="text-sm text-muted-foreground">{de.satisfaction.empty}</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="text-3xl font-bold">{summary.average}/5</div>
        <div className="text-xs text-muted-foreground">
          {de.satisfaction.avgHint.replace('{n}', String(summary.count))}
        </div>
      </div>
      <ul className="divide-y">
        {summary.recent.map((r) => (
          <li key={r.month} className="flex items-start justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="font-medium">{monthLabel(r.month)}</div>
              {r.comment ? (
                <div className="text-xs text-muted-foreground">{r.comment}</div>
              ) : null}
            </div>
            <Stars rating={r.rating} />
          </li>
        ))}
      </ul>
    </div>
  );
}
