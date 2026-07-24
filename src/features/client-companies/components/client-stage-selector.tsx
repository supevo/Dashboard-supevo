'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setClientStageAction } from '@/features/client-companies/stage-actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Client-level Stage picker (1 or 2). Applies the active-task WIP limit to all
 * of the client's projects. `currentStage` is derived from those projects.
 */
export function ClientStageSelector({
  clientCompanyId,
  currentStage,
}: {
  clientCompanyId: string;
  currentStage: number;
}) {
  const [state, formAction] = useActionState(setClientStageAction, idleResult);
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
      {state.status === 'success' && <Alert>{state.message}</Alert>}
      <div className="flex gap-2">
        {[1, 2].map((stage) => (
          <form key={stage} action={formAction}>
            <input
              type="hidden"
              name="clientCompanyId"
              value={clientCompanyId}
            />
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
