'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createPhilosophyQuoteAction,
  updatePhilosophyQuoteAction,
  deletePhilosophyQuoteAction,
} from '@/features/philosophy/actions';
import type { PhilosophyQuote } from '@/features/philosophy/queries';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import type { ActionResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';

/**
 * Admin-Editor für die Firmenphilosophie-Texte: hinzufügen, bearbeiten,
 * pausieren/aktivieren und löschen. Aktive Texte rotieren oben in der Übersicht.
 */
export function PhilosophyAdmin({ quotes }: { quotes: PhilosophyQuote[] }) {
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
      setError('Bitte einen Text (2–400 Zeichen) angeben.');
      return;
    }
    run(async () => {
      const res = await createPhilosophyQuoteAction(text);
      if (res.status !== 'error') setNewText('');
      return res;
    });
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex flex-wrap items-end gap-2">
        <Input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          maxLength={400}
          placeholder="Neuer Text, z. B. „Wir liefern, was wir versprechen.“"
          className="h-9 min-w-56 flex-1"
        />
        <Button size="sm" disabled={pending} onClick={add}>
          Hinzufügen
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Aktive Texte rotieren automatisch oben in der Übersicht. Mehrere Texte
        wechseln sich alle paar Sekunden ab.
      </p>

      {quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Texte. Füge oben welche hinzu.
        </p>
      ) : (
        <ul className="divide-y">
          {quotes.map((q) => (
            <QuoteRow key={q.id} quote={q} pending={pending} run={run} />
          ))}
        </ul>
      )}
    </div>
  );
}

function QuoteRow({
  quote,
  pending,
  run,
}: {
  quote: PhilosophyQuote;
  pending: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
}) {
  const [text, setText] = useState(quote.text);
  const dirty = text.trim() !== quote.text;

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={400}
        className={cn('h-9 min-w-56 flex-1', !quote.active && 'opacity-60')}
      />
      {dirty && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => updatePhilosophyQuoteAction({ id: quote.id, text }))}
        >
          Speichern
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          run(() =>
            updatePhilosophyQuoteAction({ id: quote.id, active: !quote.active }),
          )
        }
      >
        {quote.active ? 'Pausieren' : 'Aktivieren'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => deletePhilosophyQuoteAction(quote.id))}
      >
        Löschen
      </Button>
    </li>
  );
}
