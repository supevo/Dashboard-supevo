'use client';

import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { LeaderRow, XpLeaderboards } from '@/features/gamification/leaderboard';

type Period = 'weekly' | 'monthly' | 'allTime';

const TABS: { key: Period; label: string }[] = [
  { key: 'weekly', label: 'Diese Woche' },
  { key: 'monthly', label: 'Dieser Monat' },
  { key: 'allTime', label: 'Gesamt' },
];

const MEDAL = ['🥇', '🥈', '🥉'];

function Row({ row, rank, me }: { row: LeaderRow; rank: number; me: boolean }) {
  const top = rank <= 3;
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5',
        me ? 'border-primary/50 bg-primary/5' : 'border-transparent',
      )}
    >
      <span className="w-7 shrink-0 text-center text-lg font-bold">
        {top ? MEDAL[rank - 1] : <span className="text-sm text-muted-foreground">{rank}</span>}
      </span>
      <div className={cn('rounded-full', top && 'ring-2 ring-amber-400/70')}>
        <Avatar userId={row.userId} name={row.name} hasAvatar={row.hasAvatar} size="md" />
      </div>
      <span className={cn('min-w-0 flex-1 truncate font-medium', top && 'text-amber-500')}>
        {row.name}
      </span>
      <span className="shrink-0 text-sm font-semibold text-muted-foreground">{row.xp} XP</span>
    </li>
  );
}

export function Leaderboard({
  boards,
  currentUserId,
}: {
  boards: XpLeaderboards;
  currentUserId: string;
}) {
  const [period, setPeriod] = useState<Period>('weekly');
  const rows = boards[period];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setPeriod(t.key)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition',
              period === t.key
                ? 'bg-amber-400 text-amber-950'
                : 'border text-muted-foreground hover:bg-muted',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine XP in diesem Zeitraum.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((r, i) => (
            <Row key={r.userId} row={r} rank={i + 1} me={r.userId === currentUserId} />
          ))}
        </ul>
      )}
    </div>
  );
}
