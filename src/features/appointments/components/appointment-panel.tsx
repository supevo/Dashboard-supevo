'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { requestAppointmentAction } from '@/features/appointments/actions';
import type { AppointmentRequest } from '@/features/appointments/queries';
import { idleResult } from '@/lib/action-result';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';

const STATUS_BADGE: Record<
  AppointmentRequest['status'],
  { label: string; cls: string }
> = {
  requested: {
    label: 'Wartet auf Bestätigung',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  },
  confirmed: {
    label: 'Bestätigt',
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  },
  declined: {
    label: 'Neue Zeiten nötig',
    cls: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  },
};

function fmt(date: string, time: string | null): string {
  return `${date.split('-').reverse().join('.')}${time ? ` · ${time} Uhr` : ''}`;
}

/** One proposed-slots row (date + optional time). */
function SlotInputs({ n, required }: { n: 1 | 2 | 3; required?: boolean }) {
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 space-y-1">
        <Label htmlFor={`opt${n}_date`}>
          {n}. Wunschtermin{required ? '' : ' (optional)'}
        </Label>
        <Input id={`opt${n}_date`} name={`opt${n}_date`} type="date" required={required} />
      </div>
      <div className="w-32 space-y-1">
        <Label htmlFor={`opt${n}_time`}>Uhrzeit</Label>
        <Input id={`opt${n}_time`} name={`opt${n}_time`} type="time" />
      </div>
    </div>
  );
}

export function AppointmentPanel({
  requests,
}: {
  requests: AppointmentRequest[];
}) {
  const [state, formAction] = useActionState(requestAppointmentAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>📅 Termin anfragen</CardTitle>
          <p className="text-sm text-muted-foreground">
            Schlagt bis zu drei Wunschtermine vor – wir bestätigen euch einen
            davon, und er landet automatisch im Kalender.
          </p>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-3">
            {state.status === 'error' && (
              <Alert variant="destructive">{state.message}</Alert>
            )}
            {state.status === 'success' && <Alert>{state.message}</Alert>}
            <div className="space-y-1">
              <Label htmlFor="topic">Thema</Label>
              <Input id="topic" name="topic" required maxLength={200} placeholder="z. B. Strategie-Call" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="note">Notiz (optional)</Label>
              <Textarea id="note" name="note" rows={2} maxLength={2000} />
            </div>
            <SlotInputs n={1} required />
            <SlotInputs n={2} />
            <SlotInputs n={3} />
            <SubmitButton size="sm">Anfrage senden</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eure Terminanfragen</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Terminanfragen.
            </p>
          ) : (
            <ul className="divide-y">
              {requests.map((r) => {
                const badge = STATUS_BADGE[r.status];
                return (
                  <li key={r.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{r.topic}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    {r.status === 'confirmed' && r.confirmedDate ? (
                      <div className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
                        ✅ {fmt(r.confirmedDate, r.confirmedTime)}
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Vorgeschlagen: {r.slots.map((s) => fmt(s.date, s.time)).join(' · ')}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
