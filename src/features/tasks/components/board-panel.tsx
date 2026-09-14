import type { ReactNode } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listProjects, listProjectMembers } from '@/features/projects/queries';
import { getBoardView, getPersonalBoardView } from '@/features/tasks/queries';
import { listTeamMembers } from '@/features/messenger/queries';
import { KanbanBoard } from '@/features/tasks/components/kanban-board';
import { PersonalBoard } from '@/features/tasks/components/personal-board';
import { BoardViewSwitch } from '@/features/tasks/components/board-view-switch';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Board-Tab der Übersicht: „Persönlich" (meine Aufgaben über alle Kunden, mit
 * Status-Drag) oder „Nach Kunde" (das echte Board des gewählten Kunden, wie im
 * Kundenprojekt).
 */
export async function BoardPanel({
  orgId,
  userId,
  modus,
  kunde,
}: {
  orgId: string;
  userId: string;
  modus: 'persoenlich' | 'kunde';
  kunde: string | null;
}) {
  const projects = await listProjects(orgId);
  const clientIds = [
    ...new Set(projects.map((p) => p.clientCompanyId).filter((v): v is string => !!v)),
  ];
  const supabase = await createSupabaseServerClient();
  const { data: clients } = clientIds.length
    ? await supabase
        .from('client_companies')
        .select('id, name')
        .in('id', clientIds)
        .order('name', { ascending: true })
    : { data: [] as { id: string; name: string }[] };
  const clientOptions = (clients ?? []).map((c) => ({ id: c.id, name: c.name }));

  let content: ReactNode;

  if (modus === 'kunde') {
    const cid = kunde ?? clientOptions[0]?.id ?? null;
    const proj = projects.find((p) => p.clientCompanyId === cid);
    if (!proj) {
      content = (
        <EmptyState
          icon="🔍"
          title="Kein Board"
          description="Für diesen Kunden gibt es noch kein Projekt-Board."
        />
      );
    } else {
      const [board, members] = await Promise.all([
        getBoardView(proj.id),
        listProjectMembers(proj.id),
      ]);
      content = board ? (
        <KanbanBoard
          projectId={proj.id}
          board={board}
          members={members}
          canManage={false}
          canMove
          canAddTask
          currentUserId={userId}
        />
      ) : (
        <EmptyState icon="🔍" title="Kein Board" description="Board konnte nicht geladen werden." />
      );
    }
  } else {
    const [board, members] = await Promise.all([
      getPersonalBoardView(userId),
      listTeamMembers(orgId),
    ]);
    const total = board.columns.reduce((n, c) => n + c.tasks.length, 0);
    content =
      total === 0 ? (
        <EmptyState
          icon="🗂️"
          title="Keine Aufgaben"
          description="Dir sind aktuell keine Aufgaben zugewiesen. Schnapp dir welche im Plan oder unter „Nach Kunde“."
        />
      ) : (
        <PersonalBoard board={board} members={members} currentUserId={userId} />
      );
  }

  return (
    <div className="space-y-4">
      <BoardViewSwitch modus={modus} kunde={kunde} clients={clientOptions} />
      {content}
    </div>
  );
}
