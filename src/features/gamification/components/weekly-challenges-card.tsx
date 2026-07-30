import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { WeeklyChallenges } from '@/features/gamification/challenges';
import { cn } from '@/lib/utils';
import { de } from '@/lib/i18n/de';

/**
 * Compact weekly-challenges card for the dashboard overview: the three current
 * challenges with progress bars. Full detail (rare badges) lives in the Level-Hub.
 */
export function WeeklyChallengesCard({ weekly }: { weekly: WeeklyChallenges }) {
  const t = de.hub;
  if (weekly.challenges.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle>🏆 {t.challenges}</CardTitle>
          <span className="text-xs text-muted-foreground">
            {weekly.weekLabel} ·{' '}
            {t.challengesSub.replace('{days}', String(weekly.daysLeft))}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-3">
          {weekly.challenges.map((c) => (
            <li key={c.key}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden>{c.emoji}</span>
                  <span className="truncate font-medium">{c.title}</span>
                  {c.rareName && !c.done && (
                    <span className="shrink-0 text-xs text-amber-500" title={t.rareBadges}>
                      ✦
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-xs font-semibold',
                    c.done ? 'text-emerald-500' : 'text-primary',
                  )}
                >
                  {c.done ? t.challengeDone : `+${c.xp} XP`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      c.done ? 'bg-emerald-500' : 'bg-primary',
                    )}
                    style={{
                      width: `${Math.min(100, (c.progress / c.target) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                  {c.progress}/{c.target}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <div className="text-right">
          <Link href="/app/kudos" className="text-xs text-primary hover:underline">
            Zum Level-Hub →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
