'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { renameTaskAction } from '@/features/tasks/actions';
import { idleResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';

/**
 * Task title that turns into an input on click and saves automatically on blur
 * or Enter — same behaviour as the project title. Managers only; otherwise the
 * plain title is shown.
 */
export function EditableTaskTitle({
  projectId,
  taskId,
  title,
  canManage,
}: {
  projectId: string;
  taskId: string;
  title: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canManage) {
    return <h1 className="text-2xl font-bold">{title}</h1>;
  }

  function save() {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed === title || trimmed.length < 2) {
      setValue(title);
      setError(null);
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set('projectId', projectId);
      fd.set('taskId', taskId);
      fd.set('title', trimmed);
      const result = await renameTaskAction(idleResult, fd);
      if (result.status === 'error') {
        setError(result.message);
        setValue(title);
      } else {
        setError(null);
        router.refresh();
      }
    });
  }

  if (editing) {
    return (
      <div>
        <input
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            } else if (e.key === 'Escape') {
              setValue(title);
              setEditing(false);
            }
          }}
          className="w-full max-w-xl rounded-md border bg-background px-2 py-1 text-2xl font-bold outline-none focus:ring-2 focus:ring-primary"
        />
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <h1
        role="button"
        tabIndex={0}
        title="Zum Umbenennen klicken"
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') setEditing(true);
        }}
        className={cn(
          'inline-block cursor-text rounded px-1 text-2xl font-bold hover:bg-muted',
          pending && 'opacity-60',
        )}
      >
        {value}
      </h1>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}
