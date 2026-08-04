'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  confirmAppointmentAction,
  declineAppointmentAction,
} from '@/features/appointments/actions';
import type { PendingAppointment } from '@/features/appointments/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function fmt(date: string, time: string | null): string {
  return `${date.split('-').reverse().join('.')}${time ? ` · ${time}` : ''}`;
}

function Row({ req }: { req: PendingAppointment }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm(slot: 1 | 2 | 3) {
    setError(null);
    start(async () => {
      const res = await confirmAppointmentAction(req.id, slot);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }
  function decline() {
    setError(null);
    start(async () => {
      const res = await declineAppointmentAction(req.id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <li className="py-3">
      <div className="text-sm font-medium">
        {req.topic}{' '}
        <span className="text-xs font-normal text-muted-foreground">
          · {req.companyName} · {req.requesterName}
        </span>
      </div>
      {req.note && <div className="mt-0.5 text-xs text-muted-foreground">{req.note}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {req.slots.map((s, i) => (
          <button
            key={i}
            type="button"
            disabled={pending}
            onClick={() => confirm((i + 1) as 1 | 2 | 3)}
            className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            title="Diesen Termin bestätigen"
          >
            ✓ {fmt(s.date, s.time)}
          </button>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={decline}
          className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
        >
          Ablehnen
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </li>
  );
}

/** Agency inbox of pending client appointment requests (on the calendar page). */
export function AppointmentInbox({ requests }: { requests: PendingAppointment[] }) {
  if (requests.length === 0) return null;
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle>📅 Offene Terminanfragen ({requests.length})</CardTitle>
        <p className="text-sm text-muted-foreground">
          Bestätige einen Wunschtermin – er wird automatisch als Kalendereintrag
          angelegt und der Kunde benachrichtigt.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {requests.map((r) => (
            <Row key={r.id} req={r} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
