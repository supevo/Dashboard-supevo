'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markTaskAsIdeaAction, promoteIdeaAction } from '@/features/tasks/actions';
import { Button } from '@/components/ui/button';

/**
 * Verschiebt eine Aufgabe in den Ideen-Bereich (unverbindlich, zählt nicht als
 * Arbeit, nicht kundensichtbar) oder übernimmt eine Idee zurück in die
 * Warteschlange. Agentur-intern (nur bei canManage rendern).
 */
export function IdeaTaskButton({
  projectId,
  taskId,
  isIdea,
}: {
  projectId: string;
  taskId: string;
  isIdea: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function toggle() {
    start(async () => {
      if (isIdea) await promoteIdeaAction(taskId, projectId);
      else await markTaskAsIdeaAction(taskId, projectId);
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={toggle}>
      {isIdea ? 'In Warteschlange übernehmen' : '💡 Zu Idee verschieben'}
    </Button>
  );
}
