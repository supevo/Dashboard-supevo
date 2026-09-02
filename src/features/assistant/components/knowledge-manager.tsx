'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addKnowledgeAction,
  deleteKnowledgeAction,
} from '@/features/assistant/knowledge-actions';
import type { KnowledgeDoc } from '@/features/assistant/knowledge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/**
 * Verwaltung der Wissensbasis (RAG) – nur Super-Admin. Dokumente werden in
 * Abschnitte zerlegt, als Embeddings gespeichert und vom Assistenten per
 * Werkzeug „Wissen durchsuchen" semantisch genutzt.
 */
export function KnowledgeManager({
  docs,
  enabled,
}: {
  docs: KnowledgeDoc[];
  enabled: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    if (!title.trim() || !content.trim()) return;
    setError(null);
    setMsg(null);
    start(async () => {
      const res = await addKnowledgeAction(title, content);
      if (res.status === 'error') {
        setError('message' in res ? res.message : 'Fehler');
        return;
      }
      setTitle('');
      setContent('');
      setMsg('message' in res && res.message ? res.message : 'Gespeichert.');
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      await deleteKnowledgeAction(id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-1 text-sm font-semibold">📚 Wissensbasis des Assistenten</div>
      <p className="mb-3 text-xs text-muted-foreground">
        Interne Dokumente (Prozesse, Preislisten, FAQs, Richtlinien). Der Assistent
        durchsucht sie semantisch und antwortet fundiert darauf. Nur für Super-Admins.
      </p>

      {!enabled && (
        <Alert variant="destructive" className="mb-3">
          KI/Embeddings sind nicht aktiviert (OPENAI_API_KEY fehlt) – Dokumente können
          derzeit nicht verarbeitet werden.
        </Alert>
      )}

      <div className="space-y-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titel (z. B. „Preisliste Bäder 2026“)"
          className="text-sm"
        />
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          placeholder="Inhalt einfügen … (Text aus SOP, Preisliste, FAQ …)"
          className="min-h-[110px] resize-y text-sm"
        />
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={add}
            disabled={pending || !enabled || !title.trim() || !content.trim()}
          >
            {pending ? 'Wird verarbeitet …' : 'Zur Wissensbasis hinzufügen'}
          </Button>
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
      </div>

      <ul className="mt-3 space-y-1.5">
        {docs.length === 0 ? (
          <li className="text-xs text-muted-foreground">Noch keine Dokumente.</li>
        ) : (
          docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm"
            >
              <span className="min-w-0 truncate">
                {d.title}{' '}
                <span className="text-xs text-muted-foreground">
                  · {d.chunkCount} Abschnitt(e)
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(d.id)}
                disabled={pending}
                className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
                title="Dokument löschen"
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
