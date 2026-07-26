'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { rateTaskAction } from '@/features/ratings/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { TaskRatingSummary } from '@/features/ratings/queries';

const STARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function TaskRating({
  projectId,
  taskId,
  summary,
  canRate,
}: {
  projectId: string;
  taskId: string;
  summary: TaskRatingSummary;
  canRate: boolean;
}) {
  const [state, action] = useActionState(rateTaskAction, idleResult);
  const [value, setValue] = useState(summary.myStars ?? 0);
  const [hover, setHover] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  const shown = hover || value;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">
          {summary.average !== null ? `${summary.average}/10` : '—'}
        </span>
        <span className="text-xs text-muted-foreground">
          {summary.count > 0
            ? `${de.rating.from} ${summary.count}`
            : de.rating.none}
        </span>
      </div>

      {canRate ? (
        <form action={action}>
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="stars" value={value} />
          <div className="flex flex-wrap gap-0.5" onMouseLeave={() => setHover(0)}>
            {STARS.map((n) => (
              <button
                key={n}
                type="submit"
                onMouseEnter={() => setHover(n)}
                onClick={() => setValue(n)}
                title={`${n}/10`}
                aria-label={`${n} von 10`}
                className={cn(
                  'text-lg leading-none transition-transform hover:scale-110',
                  n <= shown ? 'text-amber-500' : 'text-muted-foreground/30',
                )}
              >
                {n <= shown ? '★' : '☆'}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{de.rating.hint}</p>
          {state.status === 'error' && (
            <Alert variant="destructive">{state.message}</Alert>
          )}
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">{de.rating.ownTask}</p>
      )}
    </div>
  );
}
