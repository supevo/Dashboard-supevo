'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { deleteEventAction } from '@/features/calendar/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { SubmitButton } from '@/components/ui/submit-button';
import type { CalendarEvent } from '@/features/calendar/queries';

function DeleteButton({ id }: { id: string }) {
  const [state, action] = useActionState(deleteEventAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost" size="sm" aria-label={de.calendar.delete}>
        ✕
      </SubmitButton>
    </form>
  );
}

function fmtDay(iso: string): string {
  return iso.split('-').reverse().slice(0, 2).join('.');
}

export function EventList({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{de.calendar.noEvents}</p>;
  }
  return (
    <ul className="divide-y">
      {events.map((e) => (
        <li
          key={e.id}
          className="flex flex-wrap items-center justify-between gap-2 py-2"
        >
          <div className="min-w-0">
            <div className="text-sm font-medium">{e.title}</div>
            <div className="text-xs text-muted-foreground">
              {fmtDay(e.date)}
              {e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ` · ${de.calendar.allDay}`}
              {e.clientName ? ` · ${e.clientName}` : ''}
              {e.location ? ` · ${e.location}` : ''}
            </div>
          </div>
          <DeleteButton id={e.id} />
        </li>
      ))}
    </ul>
  );
}
