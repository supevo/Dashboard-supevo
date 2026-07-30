'use client';

import { useState, useTransition } from 'react';
import { setSkillLevel } from '@/features/skills/actions';
import { setPreferenceLevel } from '@/features/preferences/actions';
import { cn } from '@/lib/utils';

const SEGMENTS = Array.from({ length: 10 }, (_, i) => i + 1); // 1..10

/**
 * A clickable 10-segment level bar. Clicking segment n sets the level to n;
 * clicking the currently highest filled segment clears it (0). Optimistic,
 * persisted via a server action.
 *
 * variant 'skill' (blue) → setSkillLevel; variant 'preference' (red) →
 * setPreferenceLevel. Both feed the same catalog, so the two bars can sit under
 * one item name.
 */
export function SkillBar({
  name,
  initialLevel,
  variant = 'skill',
  label,
}: {
  name: string;
  initialLevel: number;
  variant?: 'skill' | 'preference';
  /** Row label shown instead of the item name (used for combined rows). */
  label?: string;
}) {
  const [level, setLevel] = useState(initialLevel);
  const [pending, startTransition] = useTransition();
  const isPref = variant === 'preference';

  function choose(n: number) {
    const next = n === level ? 0 : n; // click active level again → clear
    setLevel(next);
    startTransition(() => {
      void (isPref ? setPreferenceLevel(name, next) : setSkillLevel(name, next));
    });
  }

  return (
    <div className="flex items-center gap-3 py-1">
      <span
        className={cn(
          'w-40 shrink-0 text-sm',
          label && (isPref ? 'text-rose-500' : 'text-primary'),
        )}
      >
        {label ?? name}
      </span>
      <div
        className={cn('flex gap-0.5', pending && 'opacity-70')}
        role="group"
        aria-label={`${name} (${isPref ? 'Lieblingsarbeit' : 'Fähigkeit'})`}
      >
        {SEGMENTS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => choose(n)}
            aria-label={`${name}: ${n} von 10`}
            title={`${n}/10`}
            className={cn(
              'h-5 w-5 rounded-sm transition-colors',
              n <= level
                ? isPref
                  ? 'bg-rose-500'
                  : 'bg-primary'
                : isPref
                  ? 'bg-muted hover:bg-rose-500/30'
                  : 'bg-muted hover:bg-primary/30',
            )}
          />
        ))}
      </div>
      <span className="w-10 shrink-0 text-xs text-muted-foreground">
        {level}/10
      </span>
    </div>
  );
}
