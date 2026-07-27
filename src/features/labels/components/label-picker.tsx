'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { assignLabelAction, removeLabelAction } from '@/features/labels/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/components/ui/submit-button';
import { readableTextColor } from '@/lib/color';
import type { Label, TaskLabel } from '@/features/labels/queries';

export function LabelPicker({
  orgId,
  projectId,
  taskId,
  assigned,
  available,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  assigned: TaskLabel[];
  available: Label[];
}) {
  const [assignState, assignAction] = useActionState(
    assignLabelAction,
    idleResult,
  );
  const [removeState, removeAction] = useActionState(
    removeLabelAction,
    idleResult,
  );
  const router = useRouter();

  useEffect(() => {
    if (assignState.status === 'success' || removeState.status === 'success') {
      router.refresh();
    }
  }, [assignState, removeState, router]);

  const assignedIds = new Set(assigned.map((l) => l.id));
  const assignable = available.filter(
    (l) => l.isActive && !assignedIds.has(l.id),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {assigned.length === 0 && (
          <span className="text-sm text-muted-foreground">–</span>
        )}
        {assigned.map((l) => (
          <span
            key={l.id}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${
              l.intensity >= 2 ? 'label-pulse font-semibold' : ''
            }`}
            style={
              {
                backgroundColor: l.color,
                color: readableTextColor(l.color),
                ...(l.intensity >= 2 ? { '--label-glow': l.color } : {}),
              } as React.CSSProperties
            }
          >
            {l.name}
            <form action={removeAction} className="inline">
              <input type="hidden" name="orgId" value={orgId} />
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="labelId" value={l.id} />
              <button type="submit" aria-label="Entfernen" className="ml-1">
                ×
              </button>
            </form>
          </span>
        ))}
      </div>

      {assignable.length > 0 && (
        <form action={assignAction} className="flex items-center gap-2">
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="taskId" value={taskId} />
          <Select name="labelId" defaultValue="" className="h-9 w-auto" required>
            <option value="" disabled>
              {de.labels.assign}
            </option>
            {assignable.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <SubmitButton variant="outline" size="sm">
            {de.labels.assign}
          </SubmitButton>
        </form>
      )}
      {(assignState.status === 'error' || removeState.status === 'error') && (
        <p className="text-xs text-destructive">
          {assignState.status === 'error'
            ? assignState.message
            : removeState.status === 'error'
              ? removeState.message
              : ''}
        </p>
      )}
    </div>
  );
}
