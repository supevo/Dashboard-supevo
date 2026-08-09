'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { verifyChoreAction } from '@/features/office-chores/actions';
import type { VerificationItem } from '@/features/office-chores/queries';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/**
 * The double-check list: chores a colleague finished that this user was drawn to
 * verify. Confirming grants XP to both; rejecting sends it back to the doer.
 */
export function ChoreVerifications({ items }: { items: VerificationItem[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aktuell nichts zu kontrollieren.
      </p>
    );
  }

  function decide(id: string, approved: boolean) {
    setError(null);
    start(async () => {
      const res = await verifyChoreAction(id, approved);
      if (res.status === 'error') {
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && <Alert variant="destructive">{error}</Alert>}
      <ul className="divide-y">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex flex-wrap items-center justify-between gap-3 py-2"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">{it.text}</div>
              <div className="text-xs text-muted-foreground">
                erledigt von {it.assigneeName}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={pending}
                onClick={() => decide(it.id, true)}
              >
                Passt ✓
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => decide(it.id, false)}
              >
                Nachbessern
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
