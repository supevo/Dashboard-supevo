'use client';

import { KanbanBoard } from '@/features/tasks/components/kanban-board';
import { setTaskStatusAction } from '@/features/tasks/actions';
import type { BoardView } from '@/features/tasks/queries';
import type { ColumnKey } from '@/lib/database.types';

interface Member {
  userId: string;
  name: string;
  hasAvatar: boolean;
  status: string | null;
}

/**
 * Persönliches, kundenübergreifendes Board. Sieht aus und funktioniert wie ein
 * Kunden-Board (Drag & Drop, Filter), aber ein Zug ändert den Status der Aufgabe
 * in IHREM eigenen Board – über setTaskStatusAction, das serverseitig das
 * WIP-/Stufen-Limit des jeweiligen Kunden erzwingt.
 */
export function PersonalBoard({
  board,
  members,
  currentUserId,
}: {
  board: BoardView;
  members: Member[];
  currentUserId: string;
}) {
  return (
    <KanbanBoard
      projectId="me"
      board={board}
      members={members}
      canManage={false}
      currentUserId={currentUserId}
      statusMove={(taskId, columnKey: ColumnKey) => {
        if (columnKey === 'custom') {
          return Promise.resolve({ status: 'success' as const, message: '' });
        }
        return setTaskStatusAction(taskId, columnKey);
      }}
    />
  );
}
