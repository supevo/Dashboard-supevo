'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  createReminderAction,
  setReminderDoneAction,
  deleteReminderAction,
} from '@/features/reminders/actions';
import type { Reminder } from '@/features/reminders/queries';

function berlinToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function dueBadge(dueAt: string | null): { label: string; tone: string } | null {
  if (!dueAt) return null;
  const day = dueAt.slice(0, 10);
  const today = berlinToday();
  const label = new Date(dueAt).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
  });
  if (day < today) return { label: 'überfällig', tone: 'text-rose-600 dark:text-rose-400' };
  if (day === today) return { label: 'heute', tone: 'text-amber-600 dark:text-amber-400' };
  return { label, tone: 'text-muted-foreground' };
}

export function RemindersCard({ initialOpen }: { initialOpen: Reminder[] }) {
  const [text, setText] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();

  function add() {
    const clean = text.trim();
    if (!clean || pending) return;
    setText('');
    start(async () => {
      await createReminderAction({ text: clean });
      router.refresh();
    });
  }
  function complete(id: string) {
    start(async () => {
      await setReminderDoneAction(id, true);
      router.refresh();
    });
  }
  function remove(id: string) {
    start(async () => {
      await deleteReminderAction(id);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">📝 Erinnerungen &amp; To-dos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
            placeholder="Neue Erinnerung … (der Assistent kann auch Termine setzen)"
            className="min-w-0 flex-1 rounded-md border bg-background px-2.5 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={add}
            disabled={pending || !text.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            +
          </button>
        </div>

        {initialOpen.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {'Keine offenen Erinnerungen. Sag dem Assistenten z. B. „Erinnere mich morgen daran, …".'}
          </p>
        ) : (
          <ul className="divide-y">
            {initialOpen.map((r) => {
              const badge = dueBadge(r.dueAt);
              return (
                <li key={r.id} className="flex items-center gap-2 py-2">
                  <button
                    type="button"
                    onClick={() => complete(r.id)}
                    disabled={pending}
                    title="Als erledigt markieren"
                    className="h-4 w-4 shrink-0 rounded border border-muted-foreground/40 hover:border-primary hover:bg-primary/10"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{r.text}</span>
                  {badge && (
                    <span className={`shrink-0 text-xs font-medium ${badge.tone}`}>
                      {badge.label}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    disabled={pending}
                    title="Löschen"
                    className="shrink-0 px-1 text-muted-foreground hover:text-rose-500"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
