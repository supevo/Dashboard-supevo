'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { claimTaskAction } from '@/features/plan/actions';

/** „Aufgabe übernehmen" – weist sich der Nutzer die Aufgabe zu und öffnet sie. */
export function ClaimButton({
  taskId,
  projectId,
}: {
  taskId: string;
  projectId: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <Button
      size="sm"
      type="button"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const res = await claimTaskAction({ taskId });
          if (res.status === 'success') {
            router.push(`/app/projects/${projectId}/tasks/${taskId}`);
          }
        })
      }
    >
      Aufgabe übernehmen →
    </Button>
  );
}

/** „Neuen Plan erstellen" – lädt die Auswahl neu. */
export function NewPlanButton() {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => start(() => router.refresh())}
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
    >
      🗓️ Neuen Plan erstellen
    </button>
  );
}
