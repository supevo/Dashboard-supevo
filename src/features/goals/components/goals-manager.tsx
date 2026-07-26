'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  createObjectiveAction,
  addKeyResultAction,
  toggleKeyResultAction,
  deleteKeyResultAction,
  setObjectiveStatusAction,
  deleteObjectiveAction,
} from '@/features/goals/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { Objective } from '@/features/goals/queries';

function useRefreshOnSuccess(status: string) {
  const router = useRouter();
  useEffect(() => {
    if (status === 'success') router.refresh();
  }, [status, router]);
}

function KeyResultRow({ kr }: { kr: Objective['keyResults'][number] }) {
  const [tState, toggle] = useActionState(toggleKeyResultAction, idleResult);
  const [dState, remove] = useActionState(deleteKeyResultAction, idleResult);
  useRefreshOnSuccess(tState.status);
  useRefreshOnSuccess(dState.status);
  return (
    <div className="flex items-center gap-2 py-1">
      <form action={toggle}>
        <input type="hidden" name="id" value={kr.id} />
        <input type="hidden" name="done" value={kr.done ? 'false' : 'true'} />
        <button
          type="submit"
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded border text-xs',
            kr.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'hover:bg-muted',
          )}
          aria-label={kr.title}
        >
          {kr.done ? '✓' : ''}
        </button>
      </form>
      <span className={cn('flex-1 text-sm', kr.done && 'text-muted-foreground line-through')}>
        {kr.title}
      </span>
      <span className="text-xs text-muted-foreground">+{kr.points}</span>
      <form action={remove}>
        <input type="hidden" name="id" value={kr.id} />
        <button type="submit" className="text-muted-foreground hover:text-destructive" aria-label="Löschen">
          ✕
        </button>
      </form>
    </div>
  );
}

function ObjectiveCard({ o }: { o: Objective }) {
  const [addState, add] = useActionState(addKeyResultAction, idleResult);
  const [, setStatus] = useActionState(setObjectiveStatusAction, idleResult);
  const [, del] = useActionState(deleteObjectiveAction, idleResult);
  const addRef = useRef<HTMLFormElement>(null);
  useRefreshOnSuccess(addState.status);
  useEffect(() => {
    if (addState.status === 'success') addRef.current?.reset();
  }, [addState]);
  const router = useRouter();

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">
            {o.title}
            {o.status === 'done' && <span className="ml-2 text-emerald-600">✓</span>}
            {o.status === 'archived' && (
              <span className="ml-2 rounded bg-muted px-1 text-xs text-muted-foreground">
                {de.goals.archived}
              </span>
            )}
          </div>
          {o.period && <div className="text-xs text-muted-foreground">{o.period}</div>}
          {o.description && <p className="mt-1 text-sm text-muted-foreground">{o.description}</p>}
        </div>
        <div className="flex items-center gap-1">
          <form action={setStatus} onSubmit={() => setTimeout(() => router.refresh(), 300)}>
            <input type="hidden" name="id" value={o.id} />
            <input type="hidden" name="status" value={o.status === 'done' ? 'active' : 'done'} />
            <SubmitButton size="sm" variant="outline">
              {o.status === 'done' ? de.goals.reopen : de.goals.markDone}
            </SubmitButton>
          </form>
          <form action={del} onSubmit={() => setTimeout(() => router.refresh(), 300)}>
            <input type="hidden" name="id" value={o.id} />
            <SubmitButton size="sm" variant="ghost">✕</SubmitButton>
          </form>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{de.goals.progress}</span>
          <span>{o.progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${o.progress}%` }} />
        </div>
      </div>

      <div className="mt-3 divide-y">
        {o.keyResults.map((kr) => (
          <KeyResultRow key={kr.id} kr={kr} />
        ))}
      </div>

      <form ref={addRef} action={add} className="mt-2 flex gap-2">
        <input type="hidden" name="objectiveId" value={o.id} />
        <Input name="title" placeholder={de.goals.addKrPlaceholder} className="h-8 flex-1 text-sm" required />
        <SubmitButton size="sm" variant="outline">{de.goals.addKr}</SubmitButton>
      </form>
    </div>
  );
}

export function GoalsManager({
  ownerId,
  objectives,
}: {
  ownerId: string;
  objectives: Objective[];
}) {
  const [state, create] = useActionState(createObjectiveAction, idleResult);
  const formRef = useRef<HTMLFormElement>(null);
  useRefreshOnSuccess(state.status);
  useEffect(() => {
    if (state.status === 'success') formRef.current?.reset();
  }, [state]);

  return (
    <div className="space-y-4">
      <form ref={formRef} action={create} className="space-y-2 rounded-lg border p-4">
        <div className="font-medium">{de.goals.newGoal}</div>
        {state.status === 'error' && <Alert variant="destructive">{state.message}</Alert>}
        <input type="hidden" name="userId" value={ownerId} />
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
          <Input name="title" placeholder={de.goals.titlePlaceholder} required className="h-9" />
          <Input name="period" placeholder={de.goals.periodPlaceholder} className="h-9" />
        </div>
        <Textarea name="description" rows={2} placeholder={de.goals.descPlaceholder} />
        <SubmitButton size="sm">{de.goals.create}</SubmitButton>
      </form>

      {objectives.length === 0 ? (
        <p className="text-sm text-muted-foreground">{de.goals.empty}</p>
      ) : (
        <div className="space-y-3">
          {objectives.map((o) => (
            <ObjectiveCard key={o.id} o={o} />
          ))}
        </div>
      )}
    </div>
  );
}
