'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addAssistantMemoryAction,
  deleteAssistantMemoryAction,
} from '@/features/assistant/memory-actions';
import type { AssistantMemory } from '@/features/assistant/memory';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/**
 * Verwaltung des dauerhaften Assistenten-Gedächtnisses (agenturweit). Einträge
 * werden bei jeder Assistenten-Anfrage in den System-Prompt geladen.
 */
export function MemoryManager({ items }: { items: AssistantMemory[] }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    const value = text.trim();
    if (!value) return;
    setError(null);
    start(async () => {
      const res = await addAssistantMemoryAction(value);
      if (res.status === 'error') {
        setError('message' in res ? res.message : 'Fehler');
        return;
      }
      setText('');
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      await deleteAssistantMemoryAction(id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-1 text-sm font-semibold">🧠 Gedächtnis des Assistenten</div>
      <p className="mb-3 text-xs text-muted-foreground">
        Dauerhafte Fakten &amp; Vorlieben, die der Assistent immer beachtet
        (agenturweit). Z. B. „Neue Aufgaben standardmäßig intern anlegen“ oder
        „Kunde Müller wird nur per E-Mail kontaktiert“. Der Assistent kann sich auch
        selbst etwas merken, wenn du „merk dir …“ sagst.
      </p>

      <div className="flex items-start gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          placeholder="Neue Regel/Vorliebe … z. B. „Angebote immer mit 14 Tagen Frist“"
          className="max-h-24 min-h-[38px] flex-1 resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" onClick={add} disabled={pending || !text.trim()}>
          Merken
        </Button>
      </div>
      {error && (
        <Alert variant="destructive" className="mt-2">
          {error}
        </Alert>
      )}

      <ul className="mt-3 space-y-1.5">
        {items.length === 0 ? (
          <li className="text-xs text-muted-foreground">
            Noch nichts gemerkt.
          </li>
        ) : (
          items.map((m) => (
            <li
              key={m.id}
              className="flex items-start justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm"
            >
              <span className="whitespace-pre-wrap">{m.content}</span>
              <button
                type="button"
                onClick={() => remove(m.id)}
                disabled={pending}
                className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
                title="Eintrag löschen"
              >
                ✕
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
