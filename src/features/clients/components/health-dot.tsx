import { de } from '@/lib/i18n/de';
import { cn } from '@/lib/utils';
import type { ClientHealth, HealthLevel } from '@/features/clients/health';

const DOT: Record<HealthLevel, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
  idle: 'bg-muted-foreground/40',
};

/**
 * Internal traffic-light for how much got done for a client this month.
 * Never shown to clients. `showLabel` adds the text next to the dot.
 */
export function ClientHealthDot({
  health,
  showLabel = false,
}: {
  health?: ClientHealth;
  showLabel?: boolean;
}) {
  const level: HealthLevel = health?.level ?? 'idle';
  const title = health
    ? `${de.clientHealth.completed}: ${health.completed} · ${de.clientHealth.overdue}: ${health.overdue} · ${de.clientHealth.open}: ${health.open}`
    : de.clientHealth.level.idle;

  return (
    <span className="inline-flex items-center gap-1.5" title={title}>
      <span className={cn('h-2.5 w-2.5 rounded-full', DOT[level])} />
      {showLabel && (
        <span className="text-xs text-muted-foreground">
          {de.clientHealth.level[level]}
        </span>
      )}
    </span>
  );
}
