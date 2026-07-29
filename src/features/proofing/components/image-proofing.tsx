'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  addImageAnnotationAction,
  setAnnotationStatusAction,
  deleteImageAnnotationAction,
} from '@/features/proofing/actions';
import type { ImageAnnotation, Stroke } from '@/features/proofing/types';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

const V = 1000; // SVG viewBox size; strokes are normalised 0..1 → *V.

function strokePath(s: Stroke): string {
  const first = s[0];
  if (!first) return '';
  return (
    `M ${(first.x * V).toFixed(1)} ${(first.y * V).toFixed(1)} ` +
    s.slice(1).map((p) => `L ${(p.x * V).toFixed(1)} ${(p.y * V).toFixed(1)}`).join(' ')
  );
}

/**
 * Visual proofing on an image: the client draws freehand change requests with a
 * comment; the agency sees them (read-only) and can mark them done. Strokes are
 * stored normalised (0..1), rendered via an SVG overlay that scales with the
 * image (non-scaling stroke keeps the line width constant).
 */
export function ImageProofing({
  fileId,
  imageUrl,
  canAnnotate,
  canResolve,
  currentUserId,
}: {
  fileId: string;
  imageUrl: string;
  canAnnotate: boolean;
  canResolve: boolean;
  currentUserId: string;
}) {
  const [annotations, setAnnotations] = useState<ImageAnnotation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const boxRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/proofing/${fileId}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { annotations: ImageAnnotation[] };
      setAnnotations(data.annotations ?? []);
    } catch {
      /* transient */
    }
  }, [fileId]);

  useEffect(() => {
    void load();
  }, [load]);

  function pointFromEvent(e: React.PointerEvent): { x: number; y: number } | null {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!drawMode) return;
    const p = pointFromEvent(e);
    if (!p) return;
    drawingRef.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setStrokes((prev) => [...prev, [p]]);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drawMode || !drawingRef.current) return;
    const p = pointFromEvent(e);
    if (!p) return;
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice();
      const last = next[next.length - 1] ?? [];
      next[next.length - 1] = [...last, p];
      return next;
    });
  }
  function onPointerUp() {
    drawingRef.current = false;
  }

  function resetDraft() {
    setStrokes([]);
    setComment('');
    setDrawMode(false);
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = await addImageAnnotationAction({ fileId, comment, strokes });
      if (res.status === 'error') {
        setError(res.message);
        return;
      }
      resetDraft();
      await load();
    });
  }

  function setStatus(id: string, status: 'open' | 'done') {
    start(async () => {
      await setAnnotationStatusAction(id, status);
      await load();
    });
  }
  function remove(id: string) {
    start(async () => {
      await deleteImageAnnotationAction(id);
      await load();
    });
  }

  const openCount = annotations.filter((a) => a.status === 'open').length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      {/* Image + overlay */}
      <div>
        {canAnnotate && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={drawMode ? 'default' : 'outline'}
              onClick={() => setDrawMode((v) => !v)}
            >
              {drawMode ? '✏️ Zeichnen aktiv' : '✏️ Markierung zeichnen'}
            </Button>
            {strokes.length > 0 && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setStrokes((p) => p.slice(0, -1))}
                >
                  ↶ Letzte
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setStrokes([])}>
                  Löschen
                </Button>
              </>
            )}
          </div>
        )}

        <div
          ref={boxRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className={cn(
            'relative w-full select-none overflow-hidden rounded-lg border',
            drawMode ? 'cursor-crosshair touch-none' : 'cursor-default',
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="block w-full" draggable={false} />
          <svg
            viewBox={`0 0 ${V} ${V}`}
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            {annotations.flatMap((a) =>
              a.strokes.map((s, i) => (
                <path
                  key={`${a.id}-${i}`}
                  d={strokePath(s)}
                  fill="none"
                  stroke={a.status === 'done' ? '#10b981' : '#ef4444'}
                  strokeWidth={selected === a.id ? 5 : 3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  opacity={selected && selected !== a.id ? 0.35 : 1}
                />
              )),
            )}
            {/* Draft (being drawn) */}
            {strokes.map((s, i) => (
              <path
                key={`draft-${i}`}
                d={strokePath(s)}
                fill="none"
                stroke="#2563eb"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        </div>

        {canAnnotate && (drawMode || strokes.length > 0 || comment) && (
          <div className="mt-2 space-y-2 rounded-lg border p-3">
            {error && <Alert variant="destructive">{error}</Alert>}
            <Textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Änderungswunsch beschreiben (optional, wenn markiert) …"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={resetDraft}>
                Abbrechen
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={pending || (strokes.length === 0 && !comment.trim())}
                onClick={submit}
              >
                {pending ? 'Wird gesendet …' : 'Änderungswunsch senden'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Change-request list */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">
          Änderungswünsche {openCount > 0 && <span className="text-rose-500">({openCount} offen)</span>}
        </div>
        {annotations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canAnnotate
              ? 'Noch keine Markierungen. Zeichne eine Markierung ins Bild.'
              : 'Noch keine Änderungswünsche.'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {annotations.map((a, idx) => (
              <li
                key={a.id}
                onMouseEnter={() => setSelected(a.id)}
                onMouseLeave={() => setSelected(null)}
                className={cn(
                  'rounded-lg border p-2 text-sm',
                  a.status === 'done' && 'opacity-60',
                  selected === a.id && 'ring-1 ring-primary',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: a.status === 'done' ? '#10b981' : '#ef4444' }}
                    />
                    #{idx + 1} · {a.authorName}
                  </span>
                  {a.status === 'done' && <span className="text-xs text-emerald-600">erledigt ✓</span>}
                </div>
                {a.comment && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{a.comment}</p>}
                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  {canResolve &&
                    (a.status === 'open' ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setStatus(a.id, 'done')}
                        className="text-primary hover:underline"
                      >
                        Erledigt
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setStatus(a.id, 'open')}
                        className="text-muted-foreground hover:underline"
                      >
                        Wieder öffnen
                      </button>
                    ))}
                  {(a.createdBy === currentUserId || canResolve) && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(a.id)}
                      className="text-muted-foreground hover:underline"
                    >
                      Löschen
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
