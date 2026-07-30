'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setTaskStatusAction } from '@/features/tasks/actions';
import { cn } from '@/lib/utils';

export type TaskStatus = 'queue' | 'active' | 'review' | 'done';

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'queue', label: 'Warteschlange' },
  { value: 'active', label: 'In Arbeit' },
  { value: 'review', label: 'Kundenüberprüfung' },
  { value: 'done', label: 'Fertig' },
];

const DOT: Record<TaskStatus, string> = {
  queue: 'bg-muted-foreground',
  active: 'bg-blue-500',
  review: 'bg-amber-500',
  done: 'bg-emerald-500',
};

/**
 * Compact status dropdown for a task. Changes the task's Kanban column straight
 * from the overview so people can work without opening the board. Optimistic:
 * updates locally, calls the server action, then refreshes the route so lists
 * and counters re-sync. On error it rolls the selection back and shows a hint.
 */
export function TaskStatusControl({
  taskId,
  status,
  className,
}: {
  taskId: string;
  status: TaskStatus | null;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState<TaskStatus | ''>(status ?? '');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: TaskStatus) {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const res = await setTaskStatusAction(taskId, next);
      if (res.status === 'error') {
        setValue(previous);
        setError(res.message ?? 'Fehler');
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-block h-2 w-2 shrink-0 rounded-full',
          value ? DOT[value] : 'bg-border',
        )}
        aria-hidden
      />
      <select
        value={value}
        disabled={pending}
        onChange={(e) => onChange(e.target.value as TaskStatus)}
        onClick={(e) => e.stopPropagation()}
        aria-label="Status ändern"
        className={cn(
          'rounded-md border bg-background px-2 py-1 text-xs',
          'focus:outline-none focus:ring-1 focus:ring-primary',
          pending && 'opacity-60',
          error && 'border-destructive',
        )}
        title={error ?? undefined}
      >
        {value === '' && <option value="">Status …</option>}
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
