'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KanbanBoard } from '@/features/tasks/components/kanban-board';
import { redeemExpressTicketAction } from '@/features/express/actions';
import type { BoardView } from '@/features/tasks/queries';
import type { ExpressStatus } from '@/features/express/queries';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/**
 * Client-facing Express-Ticket panel + board. Shows the monthly credit badge;
 * on "Einlösen" the board enters pick mode ("the system waits for the click on
 * the task"). Clicking a card redeems a ticket and flags the task Express.
 */
export function ExpressBoard({
  projectId,
  board,
  status,
  readOnly = false,
}: {
  projectId: string;
  board: BoardView;
  status: ExpressStatus;
  /** Legacy-Kunden: Board nur ansehen – kein Verschieben, kein Express. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const hasTickets = status.available > 0;

  // Read-only (Legacy) oder Konten ohne freigeschaltete Express-Tickets sehen
  // nur das normale Board – bei readOnly ohne jegliches Verschieben.
  if (readOnly || status.perMonth <= 0) {
    return (
      <KanbanBoard
        projectId={projectId}
        board={board}
        members={[]}
        canManage={false}
        reorderOnly={!readOnly}
        allowColumnMove={!readOnly}
        basePath="/portal/projects"
      />
    );
  }

  function redeem(taskId: string) {
    setError(null);
    setDone(null);
    start(async () => {
      const res = await redeemExpressTicketAction(taskId);
      if (!res.ok) {
        setError(res.error ?? 'Das hat nicht geklappt.');
        setPicking(false);
        return;
      }
      setPicking(false);
      setDone('Express-Ticket eingelöst – die Aufgabe wird vorgezogen. 🚀');
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-violet-50 px-4 py-3 dark:bg-violet-500/10">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            🚀
          </span>
          <div>
            <div className="text-sm font-semibold">Express-Ticket</div>
            <div className="text-xs text-muted-foreground">
              {status.available}/{status.perMonth} in diesem Monat verfügbar
            </div>
          </div>
        </div>
        {picking ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPicking(false)}
            disabled={pending}
          >
            Abbrechen
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setError(null);
              setDone(null);
              setPicking(true);
            }}
            disabled={!hasTickets || pending}
            title={
              hasTickets
                ? 'Aufgabe vorziehen'
                : 'Diesen Monat aufgebraucht – setzt sich am 1. zurück.'
            }
          >
            Einlösen
          </Button>
        )}
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}
      {done && (
        <Alert>
          <span className="text-sm">{done}</span>
        </Alert>
      )}
      {picking && (
        <Alert>
          <span className="text-sm">
            Klicken Sie jetzt auf die Aufgabe, die vorgezogen werden soll.
          </span>
        </Alert>
      )}

      <KanbanBoard
        projectId={projectId}
        board={board}
        members={[]}
        canManage={false}
        reorderOnly={!picking}
        allowColumnMove={!picking}
        basePath="/portal/projects"
        expressPickMode={picking}
        onExpressPick={redeem}
      />
    </div>
  );
}
