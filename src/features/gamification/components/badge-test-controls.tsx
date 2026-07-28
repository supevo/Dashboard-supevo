'use client';

import { useEffect, useState } from 'react';
import {
  BadgeUnlockAnimation,
  type UnlockBadge,
} from '@/features/gamification/components/badge-unlock-animation';
import { cn } from '@/lib/utils';

const EGG_KEY = 'supevo:easterEgg';

const EGG: UnlockBadge = {
  key: 'reset_fake',
  name: 'Badges zurücksetzen',
  emoji: '✕',
  reason: 'Kleiner Scherz – dieser Knopf setzt gar nichts zurück 😉',
};

const CELL =
  'flex h-11 w-11 items-center justify-center rounded-lg border text-xl transition';

/**
 * Fake easter-egg test badge. Looks like a "reset badges" (✕) cell in the wall
 * but does NOT reset anything – it only toggles on/off (client-only) and replays
 * the unlock animation when switched on, handy for testing the reveal.
 */
export function EasterEggBadge() {
  const [on, setOn] = useState(false);
  const [play, setPlay] = useState<UnlockBadge[]>([]);

  useEffect(() => {
    try {
      setOn(localStorage.getItem(EGG_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(EGG_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (next) setPlay([EGG]);
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        title={EGG.name}
        className={cn(CELL, on ? 'border-primary/30 bg-primary/5' : 'opacity-30 grayscale')}
      >
        <span aria-hidden>{EGG.emoji}</span>
      </button>
      <BadgeUnlockAnimation badges={play} onDone={() => setPlay([])} />
    </>
  );
}
