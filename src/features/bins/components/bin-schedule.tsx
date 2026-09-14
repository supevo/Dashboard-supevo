import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { BinDue } from '@/features/bins/queries';

function fmt(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

function whenLabel(due: BinDue): string {
  if (due.daysUntil === 0) return 'Heute';
  if (due.daysUntil === 1) return 'Morgen';
  const wd = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'long',
  }).format(new Date(`${due.date}T12:00:00Z`));
  return wd;
}

/**
 * Übersichts-Kachel „Müllabfuhr": zeigt die anstehenden Abfuhrtermine direkt aus
 * dem importierten Kalender – heute/morgen hervorgehoben, mit Hinweis, wann die
 * Tonne rauszustellen ist. Unabhängig vom Ausstempel-Mechanismus.
 */
export function BinSchedule({ dues }: { dues: BinDue[] }) {
  if (dues.length === 0) return null;

  const today = dues.filter((d) => d.daysUntil === 0);
  const putOut = dues.filter((d) => d.putOutTonight);
  const rest = dues.filter((d) => d.daysUntil > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>🗑️ Müllabfuhr</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {today.length > 0 && (
          <div className="rounded-lg bg-emerald-500/10 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              Heute Abfuhr
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              {today.map((d) => (
                <span key={`t-${d.binKey}-${d.date}`} className="font-semibold">
                  {d.label}
                </span>
              ))}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Bitte nach der Leerung wieder reinnehmen.
            </div>
          </div>
        )}

        {putOut.length > 0 && (
          <div className="rounded-lg bg-amber-500/10 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              Heute Abend rausstellen
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              {putOut.map((d) => (
                <span key={`p-${d.binKey}-${d.date}`} className="font-semibold">
                  {d.label}
                </span>
              ))}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Abfuhr morgen.
            </div>
          </div>
        )}

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Nächste Termine
          </div>
          <ul className="divide-y">
            {(rest.length > 0 ? rest : dues).map((d) => (
              <li
                key={`${d.binKey}-${d.date}`}
                className="flex items-center justify-between gap-2 py-1.5"
              >
                <span>{d.label}</span>
                <span className="text-xs text-muted-foreground">
                  {whenLabel(d)} · {fmt(d.date)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
