'use client';

import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AssistantIcon } from '@/features/assistant/components/assistant-icon';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const EXAMPLES = [
  'Trag bei Kunde Müller GmbH die Aufgabe „Startseite überarbeiten" ein.',
  'Tim soll die Aufgabe „Newsletter" von Joshua übernehmen.',
  'Lege einen neuen Kunden an: Beispiel AG, kontakt@beispiel.de.',
  'Entferne bei Kunde Müller GmbH das Modul „Social Media" ab sofort.',
];

export function AssistantChat({ firstName }: { firstName?: string }) {
  const greeting = firstName
    ? `Hallo ${firstName}, wie kann ich dir heute helfen?`
    : 'Hallo, wie kann ich dir heute helfen?';
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

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
      if (!res.ok) {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: 'Fehler bei der Anfrage. Bitte erneut versuchen.' },
        ]);
        return;
      }
      const data = (await res.json()) as { reply?: string };
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: data.reply || '(keine Antwort)' },
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

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[420px] flex-col rounded-lg border bg-card">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <AssistantIcon className="h-9 w-[2.6rem] shrink-0" />
              <p className="text-base font-semibold text-foreground">{greeting}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Sag mir einfach in eigenen Worten, was ich anlegen oder ändern soll.
              Ich löse Kunden, Mitarbeiter und Aufgaben selbst auf und frage nach,
              wenn etwas unklar ist.
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void send(ex)}
                  className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
            >
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
          className="max-h-32 min-h-[40px] flex-1 resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          Senden
        </Button>
      </form>
    </div>
  );
}
