'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { deleteTaskAction } from '@/features/tasks/actions';
import { idleResult } from '@/lib/action-result';
import { SubmitButton } from '@/components/ui/submit-button';

/**
 * Permanently deletes a task after a confirm. Only shown to users who may
 * manage the project; the server action re-checks that. On success we leave the
 * (now gone) detail page and return to the board.
 */
export function DeleteTaskButton({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}) {
  const [state, formAction] = useActionState(deleteTaskAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      // Zur Board-Seite wechseln OHNE router.refresh(): ein refresh würde die
      // gerade gelöschte Aufgaben-Route neu rendern → notFound() → 404. Der
      // Server hat das Board bereits per revalidatePath aktualisiert, und
      // replace() lässt die tote Seite nicht im Verlauf zurück (Back = kein 404).
      router.replace(`/app/projects/${projectId}`);
    }
  }, [state, router, projectId]);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !window.confirm(
            'Aufgabe endgültig löschen? Das kann nicht rückgängig gemacht werden.',
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="projectId" value={projectId} />
      <SubmitButton variant="destructive" size="sm">
        Löschen
      </SubmitButton>
      {state.status === 'error' && (
        <p className="mt-1 text-xs text-destructive">{state.message}</p>
      )}
    </form>
  );
}
