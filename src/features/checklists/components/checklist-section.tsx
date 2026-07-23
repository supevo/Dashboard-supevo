'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  addChecklistItemAction,
  createChecklistAction,
  toggleChecklistItemAction,
} from '@/features/checklists/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/ui/submit-button';
import type { ChecklistView } from '@/features/checklists/queries';

interface Ctx {
  orgId: string;
  projectId: string;
  taskId: string;
}

function ToggleItem({
  ctx,
  itemId,
  isDone,
  content,
}: {
  ctx: Ctx;
  itemId: string;
  isDone: boolean;
  content: string;
}) {
  const [state, action] = useActionState(toggleChecklistItemAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="projectId" value={ctx.projectId} />
      <input type="hidden" name="taskId" value={ctx.taskId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="isDone" value={String(!isDone)} />
      <button
        type="submit"
        className="flex items-center gap-2 text-sm"
        aria-label={content}
      >
        <span
          className={`inline-block h-4 w-4 rounded border ${
            isDone ? 'bg-primary' : 'bg-background'
          }`}
        />
        <span className={isDone ? 'text-muted-foreground line-through' : ''}>
          {content}
        </span>
      </button>
    </form>
  );
}

function AddItem({ ctx, checklistId }: { ctx: Ctx; checklistId: string }) {
  const [state, action] = useActionState(addChecklistItemAction, idleResult);
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === 'success') {
      ref.current?.reset();
      router.refresh();
    }
  }, [state, router]);
  return (
    <form ref={ref} action={action} className="mt-2 flex gap-2">
      <input type="hidden" name="orgId" value={ctx.orgId} />
      <input type="hidden" name="projectId" value={ctx.projectId} />
      <input type="hidden" name="taskId" value={ctx.taskId} />
      <input type="hidden" name="checklistId" value={checklistId} />
      <Input name="content" placeholder={de.task.newItem} className="h-8" required />
      <SubmitButton variant="outline" size="sm">
        {de.task.add}
      </SubmitButton>
    </form>
  );
}

export function ChecklistSection({
  ctx,
  checklists,
}: {
  ctx: Ctx;
  checklists: ChecklistView[];
}) {
  const [createState, createAction] = useActionState(
    createChecklistAction,
    idleResult,
  );
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (createState.status === 'success') {
      ref.current?.reset();
      router.refresh();
    }
  }, [createState, router]);

  return (
    <div className="space-y-4">
      {checklists.length === 0 && (
        <p className="text-sm text-muted-foreground">{de.task.noChecklists}</p>
      )}
      {checklists.map((cl) => (
        <div key={cl.id} className="rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium">{cl.title}</span>
            <span className="text-xs text-muted-foreground">
              {cl.doneCount}/{cl.totalCount}
            </span>
          </div>
          <div className="space-y-1">
            {cl.items.map((it) => (
              <ToggleItem
                key={it.id}
                ctx={ctx}
                itemId={it.id}
                isDone={it.isDone}
                content={it.content}
              />
            ))}
          </div>
          <AddItem ctx={ctx} checklistId={cl.id} />
        </div>
      ))}

      <form ref={ref} action={createAction} className="flex gap-2">
        <input type="hidden" name="orgId" value={ctx.orgId} />
        <input type="hidden" name="projectId" value={ctx.projectId} />
        <input type="hidden" name="taskId" value={ctx.taskId} />
        <Input name="title" placeholder={de.task.newChecklist} className="h-8" required />
        <SubmitButton variant="outline" size="sm">
          {de.task.add}
        </SubmitButton>
      </form>
    </div>
  );
}
