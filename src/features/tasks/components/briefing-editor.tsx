'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateTaskBriefingAction } from '@/features/tasks/actions';
import { idleResult } from '@/lib/action-result';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';

export function BriefingEditor({
  projectId,
  taskId,
  description,
}: {
  projectId: string;
  taskId: string;
  description: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(
    updateTaskBriefingAction,
    idleResult,
  );
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      setEditing(false);
      router.refresh();
    }
  }, [state, router]);

  if (!editing) {
    return (
      <div className="space-y-2">
        {description ? (
          <div className="whitespace-pre-wrap text-sm">{description}</div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Noch kein Briefing hinterlegt.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditing(true)}
        >
          {description ? 'Briefing bearbeiten' : 'Briefing hinzufügen'}
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="taskId" value={taskId} />
      <Textarea
        name="description"
        defaultValue={description ?? ''}
        placeholder="Briefing: Ziel, Kontext, Anforderungen, Links …"
        className="min-h-40"
      />
      <div className="flex gap-2">
        <SubmitButton size="sm">Speichern</SubmitButton>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
        >
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
