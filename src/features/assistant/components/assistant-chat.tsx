'use client';

import { useEffect, useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AssistantIcon } from '@/features/assistant/components/assistant-icon';
import { fileToDownscaledDataUrl } from '@/features/assistant/downscale';

/** Erstes Bild aus einer FileList herausziehen. */
function firstImageFile(files: FileList | null | undefined): File | undefined {
  if (!files) return undefined;
  return Array.from(files).find((f) => f.type.startsWith('image/'));
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  /** Optional screenshot the user attached (data URL), shown in the bubble. */
  image?: string;
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
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  // Bild per Einfügen (Strg/Cmd+V).
  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of Array.from(items)) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (file) {
          e.preventDefault();
          void onPickFile(file);
          return;
        }
      }
    }
  }

  // Bild per Drag&Drop.
  function onDrop(e: React.DragEvent) {
    const file = firstImageFile(e.dataTransfer?.files);
    if (file) {
      e.preventDefault();
      setDragOver(false);
      void onPickFile(file);
    }
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    try {
      setPendingImage(await fileToDownscaledDataUrl(file));
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Das Bild konnte nicht verarbeitet werden. Bitte ein anderes probieren.' },
      ]);
    }
  }

  async function send(text: string) {
    const clean = text.trim();
    const image = pendingImage;
    if ((!clean && !image) || busy) return;
    const userMsg: Msg = {
      role: 'user',
      content: clean || 'Erstelle aus diesem Screenshot eine Aufgabe.',
      ...(image ? { image } : {}),
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setPendingImage(null);
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
    <div
      className={cn(
        'flex h-[calc(100vh-12rem)] min-h-[420px] flex-col rounded-lg border bg-card',
        dragOver && 'ring-2 ring-primary ring-offset-2',
      )}
      onPaste={onPaste}
      onDrop={onDrop}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
    >
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
              wenn etwas unklar ist. Du kannst mir auch einen Screenshot (z. B. aus
              WhatsApp) hochladen – ich erkenne die Aufgabe und schlage sie dir vor.
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
                  'max-w-[85%] space-y-2 whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'border bg-background',
                )}
              >
                {m.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.image}
                    alt="Angehängter Screenshot"
                    className="max-h-48 rounded border border-white/20"
                  />
                )}
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
        className="flex flex-col gap-2 border-t p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        {pendingImage && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingImage}
              alt="Vorschau"
              className="h-12 w-12 rounded object-cover"
            />
            <span className="flex-1 text-xs text-muted-foreground">
              Screenshot angehängt – wird beim Senden ausgewertet.
            </span>
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              Entfernen
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void onPickFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Bild/Screenshot anhängen (auch per Einfügen oder Ziehen)"
            aria-label="Bild anhängen"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={1}
            placeholder="z. B. Trag bei Kunde XY folgende Aufgabe ein … oder Screenshot anhängen"
            className="max-h-32 min-h-[40px] flex-1 resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          <Button type="submit" disabled={busy || (!input.trim() && !pendingImage)}>
            Senden
          </Button>
        </div>
      </form>
    </div>
  );
}
