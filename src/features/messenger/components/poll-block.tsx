'use client';

import { useState, useTransition } from 'react';
import { votePollAction, closePollAction } from '@/features/messenger/actions';
import type { ChannelPoll } from '@/features/messenger/queries';
import { cn } from '@/lib/utils';

/**
 * Renders a poll (Abstimmung) inside the chat stream: the question, each option
 * with a vote button + result bar, the vote tally and – for the creator – a
 * button to close it. Voting toggles; single-choice polls replace the previous
 * pick. After any change it asks the parent to reload the messages.
 */
export function PollBlock({
  poll,
  canClose,
  onChanged,
}: {
  poll: ChannelPoll;
  /** Whether the current user may close the poll (its creator). */
  canClose: boolean;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const totalVotes = poll.counts.reduce((a, b) => a + b, 0);

  function vote(index: number) {
    if (poll.closed || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await votePollAction(poll.id, index);
      if (!res.ok) {
        setError(res.error ?? 'Abstimmen fehlgeschlagen.');
        return;
      }
      onChanged();
    });
  }

  function close() {
    if (pending) return;
    startTransition(async () => {
      const res = await closePollAction(poll.id);
      if (res.ok) onChanged();
    });
  }

  return (
    <div className="w-64 max-w-full rounded-lg border bg-background p-3 text-foreground">
      <div className="mb-2 flex items-start gap-1.5">
        <span aria-hidden>📊</span>
        <span className="text-sm font-semibold leading-snug">{poll.question}</span>
      </div>

      <div className="space-y-1.5">
        {poll.options.map((opt, i) => {
          const count = poll.counts[i] ?? 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const mine = poll.myVotes.includes(i);
          return (
            <button
              key={i}
              type="button"
              disabled={poll.closed || pending}
              onClick={() => vote(i)}
              className={cn(
                'relative w-full overflow-hidden rounded-md border px-2 py-1.5 text-left text-xs transition',
                mine ? 'border-primary' : 'border-border',
                !poll.closed && 'hover:border-primary/60',
                (poll.closed || pending) && 'cursor-default',
              )}
            >
              {/* result bar */}
              <span
                aria-hidden
                className={cn(
                  'absolute inset-y-0 left-0 rounded-md transition-[width]',
                  mine ? 'bg-primary/20' : 'bg-muted',
                )}
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 truncate">
                  {mine && <span className="text-primary">✓</span>}
                  <span className="truncate">{opt}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {count} · {pct}%
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {poll.totalVoters} {poll.totalVoters === 1 ? 'Stimme' : 'Stimmen'}
          {poll.allowMultiple ? ' · Mehrfachauswahl' : ''}
          {poll.closed ? ' · beendet' : ''}
        </span>
        {canClose && !poll.closed && (
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="rounded px-1.5 py-0.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Beenden
          </button>
        )}
      </div>
    </div>
  );
}
