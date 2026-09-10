'use client';

import { useState, useTransition } from 'react';
import { toggleMessageReactionAction } from '@/features/messenger/actions';
import type { MessageReaction } from '@/features/messenger/queries';
import { cn } from '@/lib/utils';

/** Schnellauswahl wie bei WhatsApp (die häufigsten Reaktionen). */
const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🔥'];

/**
 * Emoji-Reaktionen unter einer Nachricht: vorhandene Reaktionen als Chips
 * (Tippen schaltet die eigene um) plus ein „＋"-Knopf mit Schnellauswahl.
 */
export function MessageReactions({
  messageId,
  reactions,
  isMine,
  onChanged,
}: {
  messageId: string;
  reactions: MessageReaction[];
  isMine: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();

  function toggle(emoji: string) {
    setOpen(false);
    start(async () => {
      const res = await toggleMessageReactionAction({ messageId, emoji });
      if (res.status === 'success') onChanged();
    });
  }

  return (
    <div
      className={cn(
        'relative flex flex-wrap items-center gap-1',
        isMine && 'justify-end',
      )}
    >
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={busy}
          onClick={() => toggle(r.emoji)}
          className={cn(
            'flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs leading-none transition-colors disabled:opacity-50',
            r.mine
              ? 'border-primary/50 bg-primary/10 text-foreground'
              : 'border-transparent bg-muted text-muted-foreground hover:bg-muted/70',
          )}
          title={r.mine ? 'Deine Reaktion entfernen' : 'Reagieren'}
        >
          <span>{r.emoji}</span>
          {r.count > 1 && <span className="tabular-nums">{r.count}</span>}
        </button>
      ))}

      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full px-1 text-xs text-muted-foreground opacity-60 hover:opacity-100 disabled:opacity-40"
        aria-label="Mit Emoji reagieren"
      >
        🙂﹢
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className={cn(
              'absolute bottom-full z-20 mb-1 flex gap-1 rounded-full border bg-background p-1 shadow-md',
              isMine ? 'right-0' : 'left-0',
            )}
          >
            {QUICK.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => toggle(e)}
                className="rounded-full px-1 text-lg leading-none hover:bg-muted"
              >
                {e}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
