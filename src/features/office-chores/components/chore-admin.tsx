'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createChoreAction,
  updateChoreAction,
  deleteChoreAction,
} from '@/features/office-chores/actions';
import type { AdminChore } from '@/features/office-chores/queries';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import type { ActionResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';

/**
 * Admin editor for the office-chore catalog: add, rename, activate/pause and
 * delete the checkpoints that get assigned on clock-out.
 */
export function ChoreAdmin({ chores }: { chores: AdminChore[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [pending, start] = useTransition();

  function run(fn: () => Promise<ActionResult>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.status === 'error') setError(res.message);
      else router.refresh();
    });
  }

  function add() {
    const text = newText.trim();
    if (text.length < 2) {
      setError('Bitte einen Text (2–200 Zeichen) angeben.');
      return;
    }
    run(async () => {
      const res = await createChoreAction(text);
      if (res.status !== 'error') setNewText('');
      return res;
    });
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          maxLength={200}
          placeholder="Neuer Checkpunkt, z. B. „Spüle sauber?“"
          className="h-9 min-w-56 flex-1"
        />
        <Button size="sm" disabled={pending} onClick={add}>
          Hinzufügen
        </Button>
      </div>

      {chores.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Checkpunkte. Füge oben welche hinzu.
        </p>
      ) : (
        <ul className="divide-y">
          {chores.map((c) => (
            <ChoreRow key={c.id} chore={c} pending={pending} run={run} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ChoreRow({
  chore,
  pending,
  run,
}: {
  chore: AdminChore;
  pending: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
}) {
  const [text, setText] = useState(chore.text);
  const dirty = text.trim() !== chore.text;

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={200}
        className={cn('h-9 min-w-56 flex-1', !chore.active && 'opacity-60')}
      />
      {dirty && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => updateChoreAction({ id: chore.id, text }))}
        >
          Speichern
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          run(() => updateChoreAction({ id: chore.id, active: !chore.active }))
        }
      >
        {chore.active ? 'Pausieren' : 'Aktivieren'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => deleteChoreAction(chore.id))}
      >
        Löschen
      </Button>
    </li>
  );
}
