'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setActiveStageAction } from '@/features/tasks/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Lets a manager pick the active-task Stage (1 or 2), i.e. how many tasks may
 * be "Aktive Aufgabe" at once. `currentStage` is derived from that column's
 * WIP limit (null → treated as Stage 2).
 */
export function StageSelector({
  projectId,
  currentStage,
}: {
  projectId: string;
  currentStage: number;
}) {
  const [state, formAction] = useActionState(setActiveStageAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{de.kanban.stageHint}</p>
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      <div className="flex gap-2">
        {[1, 2].map((stage) => (
          <form key={stage} action={formAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="stage" value={stage} />
            <Button
              type="submit"
              variant={currentStage === stage ? 'default' : 'outline'}
              size="sm"
              className={cn(currentStage === stage && 'pointer-events-none')}
            >
              {de.kanban.stage} {stage}
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}
