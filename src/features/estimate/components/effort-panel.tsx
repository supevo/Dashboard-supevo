'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  estimateTaskAction,
  setEstimateAction,
} from '@/features/estimate/actions';
import { idleResult } from '@/lib/action-result';
import { formatMinutes } from '@/lib/time';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/utils';

export function EffortPanel({
  projectId,
  taskId,
  estimatedMinutes,
  actualMinutes,
  canManage,
}: {
  projectId: string;
  taskId: string;
  estimatedMinutes: number | null;
  actualMinutes: number;
  canManage: boolean;
}) {
  const [estState, estimate] = useActionState(estimateTaskAction, idleResult);
  const [, setManual] = useActionState(setEstimateAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (estState.status === 'success') router.refresh();
  }, [estState, router]);

  // Efficiency indicator once both numbers exist.
  let badge: { text: string; cls: string } | null = null;
  if (estimatedMinutes && actualMinutes > 0) {
    const ratio = actualMinutes / estimatedMinutes;
    if (ratio <= 1) badge = { text: de.effort.inTime, cls: 'bg-emerald-100 text-emerald-700' };
    else if (ratio <= 1.5) badge = { text: de.effort.slightlyOver, cls: 'bg-amber-100 text-amber-700' };
    else badge = { text: de.effort.over, cls: 'bg-red-100 text-red-700' };
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <div className="text-xs text-muted-foreground">{de.effort.estimated}</div>
          <div className="font-semibold">
            {estimatedMinutes ? formatMinutes(estimatedMinutes) : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{de.effort.actual}</div>
          <div className="font-semibold">{formatMinutes(actualMinutes)}</div>
        </div>
        {badge && (
          <span className={cn('rounded px-1.5 py-0.5 text-xs', badge.cls)}>
            {badge.text}
          </span>
        )}
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <form action={estimate}>
            <input type="hidden" name="taskId" value={taskId} />
            <input type="hidden" name="projectId" value={projectId} />
            <SubmitButton size="sm" variant="outline">
              ✨ {de.effort.aiEstimate}
            </SubmitButton>
          </form>
          <form action={setManual} className="flex items-center gap-1">
            <input type="hidden" name="taskId" value={taskId} />
            <input type="hidden" name="projectId" value={projectId} />
            <Input
              name="minutes"
              type="number"
              min={0}
              max={4800}
              defaultValue={estimatedMinutes ?? ''}
              placeholder="Min."
              className="h-8 w-20 text-sm"
            />
            <SubmitButton size="sm" variant="ghost">
              {de.common.save}
            </SubmitButton>
          </form>
        </div>
      )}
      {estState.status === 'error' && (
        <p className="text-xs text-destructive">{estState.message}</p>
      )}
    </div>
  );
}
