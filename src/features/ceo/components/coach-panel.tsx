'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK = [
  'Plane meinen Tag.',
  'Was sollte ich heute delegieren?',
  'Was kann ich heute streichen?',
  'Ist mein Tag realistisch für 8 Stunden?',
];

/**
 * Der GF-Coach: eigener Chat (Endpoint /api/coach) über das GF-Board. Schlägt
 * time-geblockte Tagesabläufe vor, achtet auf einen gesunden 8-h-Tag und kann
 * auf Wunsch Karten anlegen/ändern. Nach einer Antwort wird das Board neu
 * geladen, falls der Coach etwas geändert hat.
 */
export function CoachPanel({ firstName }: { firstName?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

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
      const res = await fetch('/api/coach', {
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
      // Der Coach kann Karten angelegt/verschoben haben → Board aktualisieren.
      router.refresh();
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
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          GF-Coach
        </span>
        <span className="text-xs text-muted-foreground">{open ? 'einklappen' : 'ausklappen'}</span>
      </button>

      {open && (
        <div className="border-t">
          <div
            ref={scrollRef}
            className="max-h-[42vh] min-h-[7rem] space-y-2 overflow-y-auto bg-muted/10 p-3"
          >
            {messages.length === 0 ? (
              <div className="space-y-2 py-2">
                <p className="text-sm text-muted-foreground">
                  {firstName ? `${firstName}, ich` : 'Ich'} helfe dir, deinen Tag auf
                  einen gesunden 8-Stunden-Rahmen zu bringen. Ich kenne dein GF-Board.
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void send(q)}
                      className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
                    >
                      {q}
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
                      'max-w-[88%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
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
                  …denke nach
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
              placeholder="Frag deinen Coach … z. B. „Plane meinen Vormittag mit Fokus auf Vertrieb“"
              className="max-h-28 min-h-[40px] flex-1 resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Senden">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
