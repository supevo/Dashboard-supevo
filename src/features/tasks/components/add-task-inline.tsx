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
 * Fast task entry at the bottom of a column: click to reveal an inline input,
 * type a title and press Enter to create — the field stays focused for rapid
 * entry of several tasks. A "⋯" button opens the full form (briefing, due date,
 * visibility). Agency view only (rendered when canManage).
 */
export function AddTaskInline({
  projectId,
  columnId,
}: {
  projectId: string;
  columnId: string;
}) {
  const [inline, setInline] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');

  const [quickState, quickAction] = useActionState(createTaskAction, idleResult);
  const [modalState, modalAction] = useActionState(createTaskAction, idleResult);
  const router = useRouter();

  const inputRef = useRef<HTMLInputElement>(null);
  const modalFormRef = useRef<HTMLFormElement>(null);

  // After a quick add: clear, keep the field open and focused, refresh board.
  useEffect(() => {
    if (quickState.status === 'success') {
      setTitle('');
      router.refresh();
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [quickState, router]);

  useEffect(() => {
    if (modalState.status === 'success') {
      modalFormRef.current?.reset();
      setModalOpen(false);
      router.refresh();
    }
  }, [modalState, router]);

  return (
    <>
      {inline ? (
        <form action={quickAction} className="mt-2 space-y-1">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="columnId" value={columnId} />
          <input type="hidden" name="priority" value="medium" />
          <div className="flex items-center gap-1">
            <Input
              ref={inputRef}
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={de.kanban.taskTitle}
              autoFocus
              required
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setInline(false);
                  setTitle('');
                }
              }}
              onBlur={() => {
                if (!title.trim()) setInline(false);
              }}
            />
            <button
              type="button"
              title={de.kanban.newTask}
              onMouseDown={(e) => {
                e.preventDefault();
                setModalOpen(true);
                setInline(false);
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted"
            >
              ⋯
            </button>
          </div>
          {quickState.status === 'error' && (
            <p className="text-xs text-destructive">{quickState.message}</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            {de.kanban.quickAddHint}
          </p>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setInline(true)}
          className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          + {de.kanban.addTask}
        </button>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={de.kanban.newTask}>
        <form ref={modalFormRef} action={modalAction} className="space-y-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="columnId" value={columnId} />
          <input type="hidden" name="priority" value="medium" />

          <div className="space-y-1">
            <Label htmlFor="title">{de.kanban.taskTitle}</Label>
            <Input id="title" name="title" required autoFocus defaultValue={title} />
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

          {modalState.status === 'error' && (
            <p className="text-xs text-destructive">{modalState.message}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
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
