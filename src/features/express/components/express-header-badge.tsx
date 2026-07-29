import Link from 'next/link';
import type { ExpressStatus } from '@/features/express/queries';

/**
 * Small header credit badge for the client portal: shows the monthly
 * Express-Ticket contingent (🚀 X/Y). Links to the projects page where the
 * client redeems a ticket by picking a task. Hidden when no tickets are
 * granted (perMonth = 0).
 */
export function ExpressHeaderBadge({ status }: { status: ExpressStatus }) {
  if (status.perMonth <= 0) return null;
  const exhausted = status.available <= 0;
  return (
    <Link
      href="/portal/projects"
      title={
        exhausted
          ? 'Diesen Monat aufgebraucht – setzt sich am 1. zurück.'
          : 'Aufgabe vorziehen: im Projekt auf „Einlösen" tippen und die Aufgabe wählen.'
      }
      className={
        'flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-semibold ' +
        (exhausted
          ? 'bg-muted text-muted-foreground'
          : 'bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 dark:text-violet-300')
      }
    >
      <span aria-hidden>🚀</span>
      <span>
        {status.available}/{status.perMonth}
      </span>
    </Link>
  );
}
