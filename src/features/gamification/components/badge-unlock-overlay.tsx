'use client';

import { useEffect, useState } from 'react';
import {
  BadgeUnlockAnimation,
  type UnlockBadge,
} from '@/features/gamification/components/badge-unlock-animation';

export type { UnlockBadge };

const STORAGE_KEY = 'supevo:seenBadges';

/**
 * Plays the reveal animation for badges the user just unlocked. The set of
 * currently-earned badges is compared against a localStorage baseline; only
 * genuinely new ones animate. On the very first visit we silently record the
 * baseline (no wall of animations for existing badges).
 */
export function BadgeUnlockOverlay({ badges }: { badges: UnlockBadge[] }) {
  const [fresh, setFresh] = useState<UnlockBadge[]>([]);

  useEffect(() => {
    const currentKeys = badges.map((b) => b.key);
    let seen: string[] | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      seen = raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      seen = null;
    }

    if (!Array.isArray(seen)) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentKeys));
      } catch {
        /* ignore */
      }
      return;
    }

    const seenSet = new Set(seen);
    const newly = badges.filter((b) => !seenSet.has(b.key));
    if (newly.length > 0) setFresh(newly);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([...new Set([...seen, ...currentKeys])]),
      );
    } catch {
      /* ignore */
    }
    // Run once on mount; badges is a fresh render-time snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <BadgeUnlockAnimation badges={fresh} onDone={() => setFresh([])} />;
}
