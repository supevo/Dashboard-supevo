'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { deleteTimeEntryAction } from '@/features/time-tracking/timer-actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { formatBerlinDateTime, formatMinutes } from '@/lib/time';
import { SubmitButton } from '@/components/ui/submit-button';
import type { TimeEntryView } from '@/features/time-tracking/queries';

export function TimeEntryRow({
  entry,
  projectName,
}: {
  entry: TimeEntryView;
  projectName: string;
}) {
  const [state, action] = useActionState(deleteTimeEntryAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <li className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium">
          {projectName} · {formatMinutes(entry.durationMinutes ?? 0)}
          {!entry.isBillable && (
            <span className="ml-2 text-xs text-muted-foreground">
              ({de.time.nonBillableTotal})
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatBerlinDateTime(entry.startedAt)}
          {entry.description ? ` · ${entry.description}` : ''}
        </div>
      </div>
      <form action={action}>
        <input type="hidden" name="entryId" value={entry.id} />
        <SubmitButton variant="ghost" size="sm">
          {de.time.delete}
        </SubmitButton>
      </form>
    </li>
  );
}
