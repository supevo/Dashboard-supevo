'use client';

import { useState, useTransition } from 'react';
import { setPreferenceLevel } from '@/features/preferences/actions';
import { cn } from '@/lib/utils';

const HEARTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * A work-preference row with 5 clickable hearts. Clicking heart n sets the
 * preference to n; clicking the active heart again clears it (0). Persists via
 * the setPreferenceLevel server action.
 */
export function HeartRating({
  name,
  initialLevel,
}: {
  name: string;
  initialLevel: number;
}) {
  const [level, setLevel] = useState(initialLevel);
  const [pending, startTransition] = useTransition();

  function choose(n: number) {
    const next = n === level ? 0 : n;
    const prev = level;
    setLevel(next);
    startTransition(async () => {
      try {
        await setPreferenceLevel(name, next);
      } catch {
        // Persisting failed – roll the UI back so it never shows a fake state.
        setLevel(prev);
      }
    });
  }

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-40 shrink-0 text-sm">{name}</span>
      <div
        className={cn('flex gap-0.5', pending && 'opacity-70')}
        role="group"
        aria-label={name}
      >
        {HEARTS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => choose(n)}
            aria-label={`${name}: ${n} von 10`}
            title={`${n}/10`}
            className={cn(
              'text-base leading-none transition-transform hover:scale-110',
              n <= level ? 'text-rose-500' : 'text-muted-foreground/30',
            )}
          >
            {n <= level ? '♥' : '♡'}
          </button>
        ))}
      </div>
    </div>
  );
}
