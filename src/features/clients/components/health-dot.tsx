import { de } from '@/lib/i18n/de';
import { cn } from '@/lib/utils';
import type { ClientHealth, HealthLevel } from '@/features/clients/health';

const DOT: Record<HealthLevel, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
  over: 'bg-orange-500',
  idle: 'bg-muted-foreground/40',
};

/**
 * Internal fair-share traffic light: green = balanced attention, red = under-
 * served (nurture), orange = over-served (rein in), grey = no activity. Never
 * shown to clients. `showLabel` adds the text next to the dot.
 */
export function ClientHealthDot({
  health,
  showLabel = false,
}: {
  health?: ClientHealth;
  showLabel?: boolean;
}) {
  const level: HealthLevel = health?.level ?? 'idle';
  const title =
    health && health.level !== 'idle'
      ? `${de.clientHealth.level[level]} · ${de.clientHealth.share} ${Math.round(
          health.share * 100,
        )}% (${de.clientHealth.expected} ${Math.round(health.expected * 100)}%)`
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
