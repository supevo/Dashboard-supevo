'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createTaskAction } from '@/features/tasks/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/components/ui/submit-button';

export function AddTaskInline({
  projectId,
  columnId,
}: {
  projectId: string;
  columnId: string;
}) {
  const [state, formAction] = useActionState(createTaskAction, idleResult);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="mt-2 space-y-1">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="columnId" value={columnId} />
      <input type="hidden" name="priority" value="medium" />
      <Input
        name="title"
        placeholder={de.kanban.taskTitle}
        required
        className="h-8 text-sm"
      />
      <Input
        name="dueDate"
        type="date"
        title={de.task.dueDate}
        className="h-8 text-sm"
      />
      <Select
        name="isInternal"
        defaultValue="true"
        title={de.task.visibility}
        aria-label={de.task.visibility}
        className="h-8 text-sm"
      >
        <option value="true">{de.task.internal}</option>
        <option value="false">{de.task.clientVisible}</option>
      </Select>
      <SubmitButton variant="ghost" size="sm" className="w-full">
        + {de.kanban.addTask}
      </SubmitButton>
      {state.status === 'error' && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}
    </form>
  );
}
