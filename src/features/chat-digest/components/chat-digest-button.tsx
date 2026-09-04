'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import {
  summarizeClientChatAction,
  fileClientNotesAction,
  type DigestNote,
} from '@/features/chat-digest/actions';

/**
 * „Zusammenfassen & übernehmen" für den Kundenchat (agentur-intern). Erzeugt auf
 * Knopfdruck eine KI-Zusammenfassung („Was bisher geschah") und eine Liste
 * ablagewürdiger Notizen; ausgewählte Notizen landen als Kundenseiten in der
 * Ablage. Nichts wird automatisch gespeichert.
 */
export function ChatDigestButton({
  clientCompanyId,
  channelId,
}: {
  clientCompanyId: string;
  channelId: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recap, setRecap] = useState('');
  const [notes, setNotes] = useState<DigestNote[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function run() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setDone(null);
    setNotes([]);
    setRecap('');
    const res = await summarizeClientChatAction({ clientCompanyId, channelId });
    setLoading(false);
    if (res.status === 'error') {
      setError(res.message);
      return;
    }
    const data = res.status === 'success' ? res.data : undefined;
    const gotNotes = (data?.notes as DigestNote[] | undefined) ?? [];
    setRecap((data?.recap as string | undefined) ?? '');
    setNotes(gotNotes);
    setSelected(new Set(gotNotes.map((_, i) => i))); // standardmäßig alle ausgewählt
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function file() {
    const chosen = notes.filter((_, i) => selected.has(i));
    if (chosen.length === 0) return;
    setFiling(true);
    setError(null);
    const res = await fileClientNotesAction({ clientCompanyId, notes: chosen });
    setFiling(false);
    if (res.status === 'error') {
      setError(res.message);
      return;
    }
    setDone(res.status === 'success' ? (res.message ?? 'Gespeichert.') : 'Gespeichert.');
    setNotes([]);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : void run())}
        title="Chat zusammenfassen & wichtige Infos ablegen"
        className="flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium text-muted-foreground hover:bg-muted"
      >
        <Sparkles className="h-3.5 w-3.5" /> Zusammenfassen
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-[min(90vw,26rem)] overflow-y-auto rounded-lg border bg-card p-3 shadow-xl">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">…fasse den Chat zusammen</p>
          ) : (
            <div className="space-y-3">
              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
              )}
              {done && (
                <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                  {done}
                </p>
              )}

              {recap && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Was bisher geschah
                  </p>
                  <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm">{recap}</p>
                </div>
              )}

              {notes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Ablagewürdige Infos – was übernehmen?
                  </p>
                  {notes.map((n, i) => (
                    <label
                      key={i}
                      className="flex cursor-pointer gap-2 rounded-md border p-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={() => toggle(i)}
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">{n.title}</span>
                        <span className="block text-xs text-muted-foreground">{n.content}</span>
                      </span>
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => void file()}
                    disabled={filing || selected.size === 0}
                    className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {filing
                      ? 'Wird gespeichert …'
                      : `${selected.size} in die Ablage übernehmen`}
                  </button>
                  <p className="text-[11px] text-muted-foreground">
                    Ausgewählte Infos werden als Notiz (Kundenseite) beim Kunden gespeichert.
                  </p>
                </div>
              )}

              {!loading && !error && notes.length === 0 && recap && !done && (
                <p className="text-xs text-muted-foreground">
                  Keine ablagewürdigen Infos erkannt.
                </p>
              )}

              <button
                type="button"
                onClick={() => void run()}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Neu zusammenfassen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
