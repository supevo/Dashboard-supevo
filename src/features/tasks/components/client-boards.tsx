'use client';

import { useState } from 'react';
import { KanbanBoard } from '@/features/tasks/components/kanban-board';
import { CreateProjectDialog } from '@/features/projects/components/create-project-dialog';
import { RecurringColumnBlock } from '@/features/recurring/components/recurring-column-block';
import { cn } from '@/lib/utils';
import type { BoardView } from '@/features/tasks/queries';
import type { ProjectDetail } from '@/features/projects/queries';
import type { RecurringTask } from '@/features/recurring/queries';

export interface ClientBoardBundle {
  project: ProjectDetail;
  board: BoardView | null;
  members: { userId: string; name: string }[];
  recurring: RecurringTask[];
}

/**
 * The client's board area: a segmented switcher across the client's projects
 * (1–3 in practice), the active project's Kanban board, and per-board settings.
 * The first board is the client's primary/visible board; any further board is
 * internal-only unless explicitly released.
 */
export function ClientBoards({
  orgId,
  clientCompanyId,
  companyName,
  bundles,
  canCreate,
  initialProjectId,
  currentUserId,
}: {
  orgId: string;
  clientCompanyId: string;
  companyName: string;
  bundles: ClientBoardBundle[];
  /** Whether the viewer may create boards (project.create – PMs/Admins only). */
  canCreate: boolean;
  initialProjectId?: string;
  /** Aktueller Nutzer (für den zuweisungs-abhängigen Drucksachen-Hinweis). */
  currentUserId?: string;
}) {
  const initialIndex = Math.max(
    0,
    bundles.findIndex((b) => b.project.id === initialProjectId),
  );
  const [active, setActive] = useState(initialIndex);

  if (bundles.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
        <p className="text-3xl">🗂️</p>
        <p className="mt-2 font-medium">Noch kein Board für diesen Kunden</p>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          {canCreate
            ? `Lege ein Board an, um Aufgaben und Kanban für ${companyName} zu starten.`
            : 'Für diesen Kunden gibt es noch kein Board. Die Projektleitung kann eines anlegen.'}
        </p>
        {canCreate && (
          <div className="flex justify-center">
            <CreateProjectDialog
              orgId={orgId}
              clientCompanies={[{ id: clientCompanyId, name: companyName }]}
            />
          </div>
        )}
      </div>
    );
  }

  const current = bundles[Math.min(active, bundles.length - 1)];
  if (!current) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Board:</span>
        <div className="inline-flex rounded-lg bg-muted p-1">
          {bundles.map((b, i) => (
            <button
              key={b.project.id}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition',
                i === active
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {b.project.name}
            </button>
          ))}
        </div>

        {canCreate && (
          <CreateProjectDialog
            orgId={orgId}
            clientCompanies={[{ id: clientCompanyId, name: companyName }]}
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          {active === 0 ? (
            current.project.isClientVisible ? (
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Für Kunde sichtbar
              </span>
            ) : (
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Noch nicht freigegeben
              </span>
            )
          ) : (
            <span className="rounded-full bg-slate-500/15 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              🔒 Intern
            </span>
          )}
        </div>
      </div>

      {current.board ? (
        <KanbanBoard
          projectId={current.project.id}
          board={current.board}
          members={current.members}
          canManage={current.project.canManage}
          currentUserId={currentUserId}
          canAddTask
          canMove
          activeColumnFooter={
            <RecurringColumnBlock
              projectId={current.project.id}
              items={current.recurring}
              canManage={current.project.canManage}
            />
          }
        />
      ) : (
        <p className="text-sm text-muted-foreground">Kein Board vorhanden.</p>
      )}
    </div>
  );
}
