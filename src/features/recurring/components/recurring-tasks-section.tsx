'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createRecurringTaskAction,
  toggleRecurringTaskAction,
  deleteRecurringTaskAction,
} from '@/features/recurring/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import type { RecurringTask } from '@/features/recurring/queries';

const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, i) => i + 1);

function cadenceLabel(t: RecurringTask): string {
  if (t.frequency === 'weekly') {
    return `${de.recurring.weeklyOn} ${de.recurring.weekdays[t.weekday ?? 1]}`;
  }
  return `${de.recurring.monthlyOn} ${t.dayOfMonth ?? 1}.`;
}

function Row({ t, projectId }: { t: RecurringTask; projectId: string }) {
  const [, toggle] = useActionState(toggleRecurringTaskAction, idleResult);
  const [, remove] = useActionState(deleteRecurringTaskAction, idleResult);
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          {t.title}
          {!t.active && (
            <span className="ml-2 rounded bg-muted px-1 text-xs text-muted-foreground">
              {de.recurring.paused}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {cadenceLabel(t)} · {de.recurring.nextRun}: {t.nextRunDate} ·{' '}
          {t.isInternal ? de.task.internal : de.task.clientVisible}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <form action={toggle} onSubmit={() => setTimeout(() => router.refresh(), 300)}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="id" value={t.id} />
          <input
            type="hidden"
            name="active"
            value={t.active ? 'false' : 'true'}
          />
          <SubmitButton variant="outline" size="sm">
            {t.active ? de.recurring.pause : de.recurring.resume}
          </SubmitButton>
        </form>
        <form action={remove} onSubmit={() => setTimeout(() => router.refresh(), 300)}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="id" value={t.id} />
          <SubmitButton variant="ghost" size="sm" aria-label={de.recurring.delete}>
            ✕
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

export function RecurringTasksSection({
  projectId,
  items,
}: {
  projectId: string;
  items: RecurringTask[];
}) {
  const [state, formAction] = useActionState(
    createRecurringTaskAction,
    idleResult,
  );
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('monthly');
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      setFrequency('monthly');
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{de.recurring.hint}</p>

      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}

      {items.length > 0 ? (
        <div className="divide-y">
          {items.map((t) => (
            <Row key={t.id} t={t} projectId={projectId} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{de.recurring.empty}</p>
      )}

      <form
        ref={formRef}
        action={formAction}
        className="space-y-3 border-t pt-3"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <div className="space-y-1">
          <Label htmlFor="rt-title">{de.kanban.taskTitle}</Label>
          <Input id="rt-title" name="title" required className="h-9" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rt-desc">Briefing</Label>
          <Textarea id="rt-desc" name="description" rows={2} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="rt-freq">{de.recurring.frequency}</Label>
            <Select
              id="rt-freq"
              name="frequency"
              value={frequency}
              onChange={(e) =>
                setFrequency(e.target.value as 'weekly' | 'monthly')
              }
              className="h-9"
            >
              <option value="monthly">{de.recurring.monthly}</option>
              <option value="weekly">{de.recurring.weekly}</option>
            </Select>
          </div>

          {frequency === 'weekly' ? (
            <div className="space-y-1">
              <Label htmlFor="rt-weekday">{de.recurring.weekday}</Label>
              <Select id="rt-weekday" name="weekday" defaultValue="1" className="h-9">
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
              <Select id="rt-dom" name="dayOfMonth" defaultValue="1" className="h-9">
                {DAYS_OF_MONTH.map((d) => (
                  <option key={d} value={d}>
                    {d}.
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="rt-vis">{de.task.visibility}</Label>
            <Select id="rt-vis" name="isInternal" defaultValue="true" className="h-9">
              <option value="true">{de.task.internal}</option>
              <option value="false">{de.task.clientVisible}</option>
            </Select>
          </div>
        </div>
        <SubmitButton size="sm">{de.recurring.add}</SubmitButton>
      </form>
    </div>
  );
}
