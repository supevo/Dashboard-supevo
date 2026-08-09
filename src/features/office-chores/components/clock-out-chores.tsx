'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  getMyOpenChoresAction,
  completeChoreAction,
} from '@/features/office-chores/actions';
import type { OpenChore } from '@/features/office-chores/queries';
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
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    let active = true;
    getMyOpenChoresAction()
      .then((list) => {
        if (active) setChores(list);
      })
      .catch(() => {
        if (active) setChores([]);
      });
    return () => {
      active = false;
    };
  }, [open]);

  // Nothing assigned → don't get in the way.
  useEffect(() => {
    if (open && chores !== null && chores.length === 0) onClose();
  }, [open, chores, onClose]);

  if (!open || !chores || chores.length === 0) return null;

  function done(id: string) {
    setError(null);
    start(async () => {
      const res = await completeChoreAction(id);
      if (res.status === 'error') {
        setError(res.message);
        return;
      }
      const rest = (chores ?? []).filter((c) => c.id !== id);
      setChores(rest);
      router.refresh();
      if (rest.length === 0) onClose();
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
          <ul className="space-y-2">
            {chores.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <span className="text-sm font-medium">{c.text}</span>
                <Button size="sm" disabled={pending} onClick={() => done(c.id)}>
                  Erledigt ✓
                </Button>
              </li>
            ))}
          </ul>
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
