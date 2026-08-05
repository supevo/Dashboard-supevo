'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setMyTaskNotifyPrefAction } from '@/features/notification-prefs/actions';
import { idleResult } from '@/lib/action-result';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';

/** Client self-service toggle for per-task notifications. */
export function TaskNotifyToggle({ enabled }: { enabled: boolean }) {
  const [state, formAction] = useActionState(
    setMyTaskNotifyPrefAction,
    idleResult,
  );
  const router = useRouter();
  const [checked, setChecked] = useState(enabled);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="enabled" value={checked ? 'true' : 'false'} />

      <label className="flex items-start gap-2.5 rounded-md border p-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="block text-sm font-medium">
            Benachrichtigungen je Aufgabe
          </span>
          <span className="block text-xs text-muted-foreground">
            Erhaltet eine Info, sobald wir eine Aufgabe für euch erledigt haben.
            Aus = keine aufgabenbezogenen Benachrichtigungen mehr.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <SubmitButton size="sm">Speichern</SubmitButton>
        {state.status === 'error' && (
          <Alert variant="destructive" className="flex-1">
            {state.message}
          </Alert>
        )}
        {state.status === 'success' && (
          <Alert className="flex-1">{state.message}</Alert>
        )}
      </div>
    </form>
  );
}
