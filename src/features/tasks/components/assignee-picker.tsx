'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  assignTaskAction,
  unassignTaskAction,
} from '@/features/tasks/assignee-actions';
import { idleResult } from '@/lib/action-result';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/components/ui/submit-button';
import type { TaskAssignee } from '@/features/tasks/queries';

interface Member {
  userId: string;
  name: string;
}

export function AssigneePicker({
  projectId,
  taskId,
  assignees,
  members,
}: {
  projectId: string;
  taskId: string;
  assignees: TaskAssignee[];
  members: Member[];
}) {
  const [assignState, assignAction] = useActionState(
    assignTaskAction,
    idleResult,
  );
  const [, unassignAction] = useActionState(unassignTaskAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (assignState.status === 'success') router.refresh();
  }, [assignState, router]);

  const assignedIds = new Set(assignees.map((a) => a.userId));
  const assignable = members.filter((m) => !assignedIds.has(m.userId));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {assignees.length === 0 && (
          <span className="text-sm text-muted-foreground">–</span>
        )}
        {assignees.map((a) => (
          <span
            key={a.userId}
            className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary"
          >
            {a.name || '—'}
            <form action={unassignAction} className="inline">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="userId" value={a.userId} />
              <button type="submit" aria-label="Entfernen">
                ×
              </button>
            </form>
          </span>
        ))}
      </div>
      {assignable.length > 0 && (
        <form action={assignAction} className="flex items-center gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="taskId" value={taskId} />
          <Select name="userId" defaultValue="" className="h-9 w-auto" required>
            <option value="" disabled>
              — Person wählen —
            </option>
            {assignable.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </Select>
          <SubmitButton variant="outline" size="sm">
            Zuweisen
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
