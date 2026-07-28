import { de } from '@/lib/i18n/de';
import { Avatar } from '@/components/ui/avatar';

/**
 * Large circular XP-progress ring. Shows the level in the centre, or – when an
 * avatar is passed – the user's profile picture inside the ring.
 */
export function LevelRing({
  level,
  points,
  progressPct,
  size = 200,
  avatar,
}: {
  level: number;
  points: number;
  progressPct: number;
  size?: number;
  /** When set, the profile picture is shown inside the ring instead of text. */
  avatar?: { userId: string; name: string; hasAvatar: boolean };
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, progressPct)) / 100);
  const inner = size - stroke * 2 - 10; // avatar diameter inside the ring
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
        {avatar ? (
          <Avatar
            userId={avatar.userId}
            name={avatar.name}
            hasAvatar={avatar.hasAvatar}
            size="lg"
            className="rounded-full"
            style={{ width: inner, height: inner }}
          />
        ) : (
          <>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {de.level.title}
            </span>
            <span className="text-3xl font-bold leading-tight">{level}</span>
            <span className="text-xs text-muted-foreground">
              {/* XP within the current level, matching the ring fill (each level = 100 XP). */}
              {Math.max(0, points - (level - 1) * 100)}/100 XP
            </span>
          </>
        )}
      </div>
    </div>
  );
}
