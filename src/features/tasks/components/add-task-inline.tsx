'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createTaskAction } from '@/features/tasks/actions';
import { createRecurringTaskAction } from '@/features/recurring/actions';
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

  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('monthly');

  const [quickState, quickAction] = useActionState(createTaskAction, idleResult);
  const [modalState, modalAction] = useActionState(createTaskAction, idleResult);
  const [recurringState, recurringAction] = useActionState(
    createRecurringTaskAction,
    idleResult,
  );
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
    if (modalState.status === 'success' || recurringState.status === 'success') {
      modalFormRef.current?.reset();
      setModalOpen(false);
      setRecurring(false);
      setFrequency('monthly');
      router.refresh();
    }
  }, [modalState, recurringState, router]);

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
        <form
          ref={modalFormRef}
          action={recurring ? recurringAction : modalAction}
          className="space-y-4"
        >
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
            {!recurring && (
              <div className="space-y-1">
                <Label htmlFor="dueDate">{de.task.dueDate}</Label>
                <Input id="dueDate" name="dueDate" type="date" />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="isInternal">{de.task.visibility}</Label>
              <Select id="isInternal" name="isInternal" defaultValue="false">
                <option value="true">{de.task.internal}</option>
                <option value="false">{de.task.clientVisible}</option>
              </Select>
            </div>
          </div>

          <div className="rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="h-4 w-4"
              />
              {de.recurring.asOption}
            </label>

            {recurring && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="rt-freq">{de.recurring.frequency}</Label>
                  <Select
                    id="rt-freq"
                    name="frequency"
                    value={frequency}
                    onChange={(e) =>
                      setFrequency(e.target.value as 'weekly' | 'monthly')
                    }
                  >
                    <option value="monthly">{de.recurring.monthly}</option>
                    <option value="weekly">{de.recurring.weekly}</option>
                  </Select>
                </div>
                {frequency === 'weekly' ? (
                  <div className="space-y-1">
                    <Label htmlFor="rt-weekday">{de.recurring.weekday}</Label>
                    <Select id="rt-weekday" name="weekday" defaultValue="1">
                      {de.recurring.weekdays.map((w, i) => (
                        <option key={i} value={i}>
                          {w}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label htmlFor="rt-dom">{de.recurring.dayOfMonth}</Label>
                    <Select id="rt-dom" name="dayOfMonth" defaultValue="1">
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          {d}.
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  {de.recurring.asOptionHint}
                </p>
              </div>
            )}
          </div>

          {(() => {
            const active = recurring ? recurringState : modalState;
            return active.status === 'error' ? (
              <p className="text-xs text-destructive">{active.message}</p>
            ) : null;
          })()}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              {de.common.cancel}
            </button>
            <SubmitButton>
              {recurring ? de.recurring.add : de.kanban.addTask}
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
