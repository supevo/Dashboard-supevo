'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  getMyOpenChoresAction,
  completeChoreAction,
} from '@/features/office-chores/actions';
import type { OpenChore } from '@/features/office-chores/queries';
import {
  getMyOpenBinTasksAction,
  completeBinTaskAction,
} from '@/features/bins/actions';
import type { OpenBinTask } from '@/features/bins/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/**
 * Shown right after clock-out: the office chore(s) fairly assigned to this
 * person. Confirming "erledigt" sends it to a colleague's double-check. Nothing
 * blocks clocking out – the modal can be closed with "Später".
 */
export function ClockOutChoresModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [chores, setChores] = useState<OpenChore[] | null>(null);
  const [bins, setBins] = useState<OpenBinTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    let active = true;
    getMyOpenChoresAction()
      .then((list) => active && setChores(list))
      .catch(() => active && setChores([]));
    getMyOpenBinTasksAction()
      .then((list) => active && setBins(list))
      .catch(() => active && setBins([]));
    return () => {
      active = false;
    };
  }, [open]);

  const loaded = chores !== null && bins !== null;
  const empty = (chores?.length ?? 0) === 0 && (bins?.length ?? 0) === 0;

  // Nichts zugeteilt → nicht im Weg stehen.
  useEffect(() => {
    if (open && loaded && empty) onClose();
  }, [open, loaded, empty, onClose]);

  if (!open || !loaded || empty) return null;

  function done(id: string) {
    setError(null);
    start(async () => {
      const res = await completeChoreAction(id);
      if (res.status === 'error') {
        setError(res.message);
        return;
      }
      setChores((prev) => (prev ?? []).filter((c) => c.id !== id));
      router.refresh();
    });
  }

  function doneBin(id: string) {
    setError(null);
    start(async () => {
      const res = await completeBinTaskAction(id);
      if (res.status === 'error') {
        setError('message' in res ? (res.message ?? 'Fehler') : 'Fehler');
        return;
      }
      setBins((prev) => (prev ?? []).filter((b) => b.id !== id));
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Schließen"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <Card className="relative w-full max-w-md">
        <CardHeader>
          <CardTitle>🧹 Ordnungsdienst</CardTitle>
          <p className="text-sm text-muted-foreground">
            Bevor du gehst: dein Checkpunkt. Ein:e Kolleg:in prüft danach kurz
            gegen – dafür gibt&rsquo;s XP.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <Alert variant="destructive">{error}</Alert>}
          {(chores?.length ?? 0) > 0 && (
            <ul className="space-y-2">
              {chores!.map((c) => (
                <li
                  key={c.id}
                  className={`flex items-center justify-between gap-3 rounded-md border p-3 ${
                    c.makeup ? 'border-amber-400/60 bg-amber-400/10' : ''
                  }`}
                >
                  <span className="text-sm font-medium">
                    {c.text}
                    {c.makeup && (
                      <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        nachholen · keine XP
                      </span>
                    )}
                  </span>
                  <Button size="sm" disabled={pending} onClick={() => done(c.id)}>
                    Erledigt ✓
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {(bins?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                🗑️ Mülltonnen
              </div>
              <ul className="space-y-2">
                {bins!.map((b) => (
                  <li
                    key={b.id}
                    className={`flex items-center justify-between gap-3 rounded-md border p-3 ${
                      b.makeup ? 'border-amber-400/60 bg-amber-400/10' : ''
                    }`}
                  >
                    <span className="text-sm font-medium">
                      {b.label}
                      {b.makeup && (
                        <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          nachholen · keine XP
                        </span>
                      )}
                    </span>
                    <Button size="sm" disabled={pending} onClick={() => doneBin(b.id)}>
                      Erledigt ✓
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="text-right">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-muted-foreground hover:underline"
            >
              Später
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
