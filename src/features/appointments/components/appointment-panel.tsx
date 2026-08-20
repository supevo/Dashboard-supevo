'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
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
import { cn } from '@/lib/utils';

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

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];
const MAX_SLOTS = 3;

function fmt(date: string, time: string | null): string {
  return `${date.split('-').reverse().join('.')}${time ? ` · ${time} Uhr` : ''}`;
}

/** Local YYYY-MM-DD (no UTC shift). */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

interface Slot {
  date: string;
  time: string;
}

/** An interactive month calendar: click days to pick up to three Wunschtermine. */
function CalendarPicker({
  slots,
  setSlots,
}: {
  slots: Slot[];
  setSlots: (s: Slot[]) => void;
}) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [view, setView] = useState({
    y: today.getFullYear(),
    m: today.getMonth(),
  });

  const todayIso = isoDay(today);
  const selectedDates = new Set(slots.map((s) => s.date));

  const grid = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const lead = (first.getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(isoDay(new Date(view.y, view.m, day)));
    }
    return cells;
  }, [view]);

  function toggleDay(iso: string) {
    if (iso < todayIso) return; // no past days
    if (selectedDates.has(iso)) {
      setSlots(slots.filter((s) => s.date !== iso));
      return;
    }
    if (slots.length >= MAX_SLOTS) return;
    setSlots([...slots, { date: iso, time: '' }].sort((a, b) => a.date.localeCompare(b.date)));
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  const atMinMonth = view.y === today.getFullYear() && view.m === today.getMonth();

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          disabled={atMinMonth}
          className="rounded-md border px-2 py-1 text-sm hover:bg-muted disabled:opacity-40"
          aria-label="Vorheriger Monat"
        >
          ‹
        </button>
        <div className="text-sm font-semibold">
          {MONTH_NAMES[view.m]} {view.y}
        </div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="rounded-md border px-2 py-1 text-sm hover:bg-muted"
          aria-label="Nächster Monat"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[10px] text-muted-foreground">
            {w}
          </div>
        ))}
        {grid.map((iso, i) => {
          if (!iso) return <div key={`lead-${i}`} />;
          const past = iso < todayIso;
          const selected = selectedDates.has(iso);
          const order = slots.findIndex((s) => s.date === iso) + 1;
          const full = !selected && slots.length >= MAX_SLOTS;
          return (
            <button
              key={iso}
              type="button"
              disabled={past || full}
              onClick={() => toggleDay(iso)}
              className={cn(
                'relative flex h-9 items-center justify-center rounded-md text-sm transition',
                selected
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'hover:bg-muted',
                iso === todayIso && !selected && 'ring-1 ring-primary',
                (past || full) && 'cursor-not-allowed opacity-30 hover:bg-transparent',
              )}
            >
              {Number(iso.slice(8, 10))}
              {selected && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background text-[9px] font-bold text-primary ring-1 ring-primary">
                  {order}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {slots.length}/{MAX_SLOTS} Wunschtermine gewählt – tippe auf einen Tag,
        um ihn hinzuzufügen oder zu entfernen.
      </p>
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
  const [slots, setSlots] = useState<Slot[]>([]);

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
      setSlots([]);
    }
  }, [state, router]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>📅 Termin anfragen</CardTitle>
          <p className="text-sm text-muted-foreground">
            Wählt bis zu drei Wunschtermine im Kalender – wir bestätigen euch
            einen davon, und er landet automatisch im Kalender.
          </p>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
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

            <div className="grid gap-4 md:grid-cols-2">
              <CalendarPicker slots={slots} setSlots={setSlots} />

              <div className="space-y-2">
                <Label>Gewählte Wunschtermine</Label>
                {slots.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Noch kein Termin gewählt. Tippe im Kalender auf bis zu drei
                    Tage.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {slots.map((s, i) => (
                      <li
                        key={s.date}
                        className="flex items-center gap-2 rounded-md border p-2"
                      >
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                          {i + 1}
                        </span>
                        <span className="flex-1 text-sm">
                          {s.date.split('-').reverse().join('.')}
                        </span>
                        <input
                          type="time"
                          aria-label={`Uhrzeit ${i + 1}. Wunschtermin`}
                          value={s.time}
                          onChange={(e) => {
                            const next = [...slots];
                            next[i] = { ...s, time: e.target.value };
                            setSlots(next);
                          }}
                          className="h-9 rounded-md border bg-background px-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setSlots(slots.filter((x) => x.date !== s.date))}
                          className="rounded-md px-1.5 py-1 text-sm text-muted-foreground hover:bg-muted"
                          aria-label="Termin entfernen"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  Uhrzeit ist optional – ohne Angabe klären wir sie mit euch ab.
                </p>
              </div>
            </div>

            {/* Slots als versteckte Felder für die Server-Action. */}
            {[0, 1, 2].map((i) => (
              <span key={i}>
                <input type="hidden" name={`opt${i + 1}_date`} value={slots[i]?.date ?? ''} />
                <input type="hidden" name={`opt${i + 1}_time`} value={slots[i]?.time ?? ''} />
              </span>
            ))}

            <SubmitButton size="sm" disabled={slots.length === 0}>
              Anfrage senden
            </SubmitButton>
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
