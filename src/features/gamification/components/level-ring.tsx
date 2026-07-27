import { de } from '@/lib/i18n/de';

/** Large circular XP-progress ring with the level in the centre. */
export function LevelRing({
  level,
  points,
  nextLevelPoints,
  progressPct,
  size = 200,
}: {
  level: number;
  points: number;
  nextLevelPoints: number;
  progressPct: number;
  size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, progressPct)) / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="text-emerald-500 transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {de.level.title}
        </span>
        <span className="text-3xl font-bold leading-tight">{level}</span>
        <span className="text-xs text-muted-foreground">
          {points}/{nextLevelPoints} XP
        </span>
      </div>
    </div>
  );
}
