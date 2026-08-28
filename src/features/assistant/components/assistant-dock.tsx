'use client';

import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AssistantIcon } from '@/features/assistant/components/assistant-icon';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const OPEN_KEY = 'assistantDockOpen';

/**
 * Schwebendes Assistenten-Dock unten rechts, direkt ÜBER dem Teamchat-Button.
 * Nutzt denselben Endpoint (/api/assistant) wie die Vollseite; der Assistent
 * handelt mit den Rechten des angemeldeten Nutzers.
 */
export function AssistantDock({ firstName }: { firstName?: string }) {
  const greeting = firstName
    ? `Hallo ${firstName}, wie kann ich dir heute helfen?`
    : 'Hallo, wie kann ich dir heute helfen?';
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(OPEN_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [open]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy, open]);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    const next = [...messages, { role: 'user' as const, content: clean }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const data = res.ok ? ((await res.json()) as { reply?: string }) : null;
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: data?.reply || 'Fehler bei der Anfrage. Bitte erneut versuchen.',
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Netzwerkfehler. Bitte erneut versuchen.' },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Assistent"
        className="fixed bottom-[4.75rem] right-4 z-50 flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-lg transition hover:bg-muted"
      >
        <AssistantIcon className="h-6 w-[1.85rem]" />
        Assistent
      </button>
    );
  }

  return (
    <div className="fixed bottom-[4.75rem] right-4 z-50 flex h-[min(70vh,520px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <AssistantIcon className="h-5 w-6" />
          Assistent
        </span>
        <div className="flex items-center gap-1">
          <a
            href="/app/assistant"
            className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
            title="Im Vollbild öffnen"
          >
            ⤢ Vollbild
          </a>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded px-2 text-lg leading-none text-muted-foreground hover:bg-muted"
            aria-label="Schließen"
            title="Schließen"
          >
            –
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-muted/10 p-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
            <AssistantIcon className="h-11 w-[3.2rem]" />
            <p className="text-sm font-medium text-foreground">{greeting}</p>
            <p className="text-xs text-muted-foreground">
              {'Sag mir, was ich anlegen oder ändern soll – z. B. „Trag bei Kunde XY die Aufgabe ‚…‘ ein“ oder „Hinterlege bei Kunde XY dieses Passwort: …“. Ich handle mit deinen Rechten.'}
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'border bg-background',
                )}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
              …arbeite daran
            </div>
          </div>
        )}
      </div>

      <form
        className="flex items-end gap-2 border-t p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={1}
          placeholder="z. B. Trag bei Kunde XY folgende Aufgabe ein …"
          className="max-h-24 min-h-[38px] flex-1 resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Senden
        </button>
      </form>
    </div>
  );
}
