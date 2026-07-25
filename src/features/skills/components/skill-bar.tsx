'use client';

import { useState, useTransition } from 'react';
import { setSkillLevel } from '@/features/skills/actions';
import { cn } from '@/lib/utils';

const SEGMENTS = Array.from({ length: 10 }, (_, i) => i + 1); // 1..10

/**
 * A skill with a clickable 10-segment level bar. Clicking segment n sets the
 * level to n; clicking the currently highest filled segment clears it (0).
 * Updates optimistically and persists via the setSkillLevel server action.
 */
export function SkillBar({
  name,
  initialLevel,
}: {
  name: string;
  initialLevel: number;
}) {
  const [level, setLevel] = useState(initialLevel);
  const [pending, startTransition] = useTransition();

  function choose(n: number) {
    const next = n === level ? 0 : n; // click active level again → clear
    setLevel(next);
    startTransition(() => {
      void setSkillLevel(name, next);
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
                ? 'bg-primary'
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
