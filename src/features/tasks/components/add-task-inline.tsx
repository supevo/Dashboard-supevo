'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createTaskAction } from '@/features/tasks/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';

/**
 * "+ Hinzufügen" button that opens an overlay to create a task with title,
 * briefing, due date and visibility. Agency view only (rendered when canManage).
 */
export function AddTaskInline({
  projectId,
  columnId,
}: {
  projectId: string;
  columnId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createTaskAction, idleResult);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        + {de.kanban.addTask}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={de.kanban.newTask}>
        <form ref={formRef} action={formAction} className="space-y-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="columnId" value={columnId} />
          <input type="hidden" name="priority" value="medium" />

          <div className="space-y-1">
            <Label htmlFor="title">{de.kanban.taskTitle}</Label>
            <Input id="title" name="title" required autoFocus />
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Briefing</Label>
            <Textarea id="description" name="description" rows={4} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="dueDate">{de.task.dueDate}</Label>
              <Input id="dueDate" name="dueDate" type="date" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="isInternal">{de.task.visibility}</Label>
              <Select id="isInternal" name="isInternal" defaultValue="true">
                <option value="true">{de.task.internal}</option>
                <option value="false">{de.task.clientVisible}</option>
              </Select>
            </div>
          </div>

          {state.status === 'error' && (
            <p className="text-xs text-destructive">{state.message}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              {de.common.cancel}
            </button>
            <SubmitButton>{de.kanban.addTask}</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
