'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { setTaskReactionAction } from '@/features/reactions/actions';
import { REACTION_EMOJIS } from '@/features/reactions/shared';
import type { ClientWeekWork } from '@/features/recap/client-week';
import { cn } from '@/lib/utils';

/** One completed result with a row of emoji reaction buttons. */
function CompletedRow({
  id,
  title,
  initialEmoji,
}: {
  id: string;
  title: string;
  initialEmoji: string | null;
}) {
  const [emoji, setEmoji] = useState<string | null>(initialEmoji);
  const [pending, start] = useTransition();

  function react(next: string) {
    const target = emoji === next ? null : next; // tap again = remove
    const prev = emoji;
    setEmoji(target); // optimistic
    start(async () => {
      const res = await setTaskReactionAction(id, target);
      if (!res.ok) setEmoji(prev); // revert on failure
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="min-w-0 flex-1 text-sm">✅ {title}</span>
      <div className="flex shrink-0 items-center gap-0.5">
        {REACTION_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            disabled={pending}
            onClick={() => react(e)}
            aria-pressed={emoji === e}
            title="Reagieren"
            className={cn(
              'rounded-md px-1.5 py-0.5 text-base leading-none transition',
              emoji === e
                ? 'bg-primary/15 ring-1 ring-primary/40'
                : 'opacity-40 hover:opacity-100 hover:bg-muted',
            )}
          >
            {e}
          </button>
        ))}
      </div>
    </li>
  );
}

/**
 * "Was wir diese Woche für euch getan haben" – shows this week's delivered
 * results (with a one-tap reaction each) and what's currently in progress.
 */
export function WeekWorkCard({ data }: { data: ClientWeekWork }) {
  const hasAny = data.completed.length > 0 || data.ongoing.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>✨ Was wir diese Woche für euch getan haben</CardTitle>
        <p className="text-sm text-muted-foreground">
          Ergebnisse der letzten 7 Tage – tippt auf ein Emoji, um zu reagieren.
          Euer Team freut sich darüber!
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasAny && (
          <p className="text-sm text-muted-foreground">
            Diese Woche gibt es noch nichts zu berichten – wir sind aber dran.
          </p>
        )}

        {data.completed.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
              Fertiggestellt
            </div>
            <ul className="divide-y">
              {data.completed.map((t) => (
                <CompletedRow
                  key={t.id}
                  id={t.id}
                  title={t.title}
                  initialEmoji={t.myEmoji}
                />
              ))}
            </ul>
          </div>
        )}

        {data.ongoing.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
              Aktuell in Arbeit
            </div>
            <ul className="divide-y">
              {data.ongoing.map((t) => (
                <li key={t.id} className="py-2 text-sm text-muted-foreground">
                  🔧 {t.title}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
