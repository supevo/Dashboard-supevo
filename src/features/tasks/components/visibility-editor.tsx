'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateTaskVisibilityAction } from '@/features/tasks/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

/**
 * Sichtbarkeit einer Aufgabe (intern ↔ für Kunde sichtbar). Als echter Schalter,
 * der die Sichtbarkeit sofort umlegt – jederzeit nachträglich änderbar durch die
 * Agentur-Mitarbeiter (RLS erlaubt es allen, die interne Aufgaben sehen).
 */
export function VisibilityEditor({
  projectId,
  taskId,
  isInternal,
}: {
  projectId: string;
  taskId: string;
  isInternal: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Client-visible = Schalter „an".
  const clientVisible = !isInternal;

  function toggle() {
    setError(null);
    const next = clientVisible; // aktuell sichtbar → auf intern; sonst sichtbar
    const fd = new FormData();
    fd.set('projectId', projectId);
    fd.set('taskId', taskId);
    // isInternal = das Gegenteil des aktuellen Zustands.
    fd.set('isInternal', next ? 'true' : 'false');
    start(async () => {
      const res = await updateTaskVisibilityAction(idleResult, fd);
      if (res.status === 'error') {
        setError(res.message ?? de.errors.INTERNAL);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {error && <Alert variant="destructive">{error}</Alert>}

      <button
        type="button"
        role="switch"
        aria-checked={clientVisible}
        disabled={busy}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 rounded-md border p-2 text-left transition hover:bg-muted/50 disabled:opacity-60"
      >
        <span className="text-sm">
          {clientVisible ? de.task.clientVisible : de.task.internal}
        </span>
        <span
          className={cn(
            'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
            clientVisible ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
              clientVisible ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </span>
      </button>

      <p className="text-xs text-muted-foreground">{de.task.visibilityHint}</p>
    </div>
  );
}
