'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wand2, Send } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const OPEN_KEY = 'coachDockOpen';

const QUICK = [
  'Plane meinen Tag.',
  'Was sollte ich delegieren?',
  'Was kann ich heute streichen?',
];

/**
 * Schwebendes GF-Coach-Dock unten rechts – ÜBER dem Assistenten-Dock. Nur für
 * den/die Geschäftsführer:in (Super-Admin). Nutzt denselben Endpoint
 * (/api/coach) und kennt das GF-Board; nach einer Antwort wird die aktuelle
 * Seite neu geladen (aktualisiert u. a. das Board auf /app/gf).
 */
export function CoachDock({ firstName }: { firstName?: string }) {
  const greeting = firstName
    ? `Hallo ${firstName}, wobei helfe ich dir heute?`
    : 'Hallo, wobei helfe ich dir heute?';
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="GF-Coach"
        className="fixed bottom-[9.5rem] right-4 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-[#2D6CDF] to-[#8A2D8F] px-3 py-2 text-sm font-medium text-white shadow-lg transition hover:opacity-90"
      >
        <Wand2 className="h-5 w-5" />
        Coach
      </button>
    );
  }

  return (
    <div className="fixed bottom-[9.5rem] right-4 z-50 flex h-[min(68vh,500px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Wand2 className="h-4 w-4 text-primary" />
          GF-Coach
        </span>
        <div className="flex items-center gap-1">
          <a
            href="/app/gf"
            className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
            title="GF-Board öffnen"
          >
            Board
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
          <div className="flex flex-col items-start gap-2 px-1 py-3">
            <p className="text-sm font-medium text-foreground">{greeting}</p>
            <p className="text-xs text-muted-foreground">
              Ich kenne dein GF-Board und bringe deinen Tag auf einen gesunden
              8-Stunden-Rahmen.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
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
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
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
          placeholder="Frag deinen Coach …"
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
          aria-label="Senden"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
