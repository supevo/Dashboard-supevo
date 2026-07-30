'use client';

import { useState } from 'react';
import {
  BadgeUnlockAnimation,
  type UnlockBadge,
} from '@/features/gamification/components/badge-unlock-animation';
import { EasterEggBadge } from '@/features/gamification/components/badge-test-controls';
import { cn } from '@/lib/utils';

export interface WallBadgeItem {
  key: string;
  name: string;
  emoji: string;
  earned: boolean;
  reason: string;
  /** How often this badge was earned (>1 shows a count bubble). */
  count?: number;
}

/**
 * The collectible badge wall. Locked badges are greyed and show only their name
 * on hover. Clicking an EARNED badge replays its reveal animation (name +
 * how it was unlocked) – the mystery stays for locked ones.
 */
export function WallBadges({ badges }: { badges: WallBadgeItem[] }) {
  const [play, setPlay] = useState<UnlockBadge[]>([]);

  return (
    <>
      <div className="flex flex-wrap gap-2.5">
        {badges.map((b) => (
          <button
            type="button"
            key={b.key}
            title={b.name}
            onClick={() =>
              b.earned &&
              setPlay([{ key: b.key, name: b.name, emoji: b.emoji, reason: b.reason }])
            }
            className={cn(
              'relative flex h-12 w-12 items-center justify-center rounded-lg border text-2xl transition',
              b.earned
                ? 'cursor-pointer border-primary/30 bg-primary/5 hover:scale-110'
                : 'cursor-default opacity-30 grayscale',
            )}
          >
            <span aria-hidden>{b.emoji}</span>
            {b.earned && (b.count ?? 1) > 1 && (
              <span
                className="absolute -bottom-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border border-background bg-primary px-1 text-[11px] font-bold leading-none text-primary-foreground shadow"
                aria-label={`${b.count}×`}
              >
                {b.count}
              </span>
            )}
          </button>
        ))}
        <EasterEggBadge />
      </div>
      <BadgeUnlockAnimation badges={play} onDone={() => setPlay([])} />
    </>
  );
}
