'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { archiveTaskAction } from '@/features/tasks/actions';
import { idleResult } from '@/lib/action-result';
import { SubmitButton } from '@/components/ui/submit-button';

/**
 * Archives or restores a task. Archived tasks leave the active columns and
 * appear in the read-only "Archiv" column on the board.
 */
export function ArchiveTaskButton({
  projectId,
  taskId,
  isArchived,
}: {
  projectId: string;
  taskId: string;
  isArchived: boolean;
}) {
  const [state, formAction] = useActionState(archiveTaskAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="archived" value={isArchived ? 'false' : 'true'} />
      <SubmitButton variant="outline" size="sm">
        {isArchived ? 'Wiederherstellen' : 'Archivieren'}
      </SubmitButton>
    </form>
  );
}
