import { cn } from '@/lib/utils';

/** Compact metric tile: coloured icon square + big number + label. */
export function StatTile({
  icon,
  value,
  label,
  color,
}: {
  icon: string;
  value: number | string;
  label: string;
  color: 'emerald' | 'cyan' | 'violet' | 'pink';
}) {
  const bg: Record<typeof color, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-500',
    cyan: 'bg-cyan-500/15 text-cyan-500',
    violet: 'bg-violet-500/15 text-violet-500',
    pink: 'bg-pink-500/15 text-pink-500',
  };
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl',
          bg[color],
        )}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="truncate text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
