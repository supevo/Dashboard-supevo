'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { moveTaskAction } from '@/features/tasks/actions';
import { computeInsertPosition } from '@/features/tasks/reorder';
import { AddTaskInline } from './add-task-inline';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { LabelChip } from '@/components/ui/label-chip';
import { Avatar } from '@/components/ui/avatar';
import type { BoardColumn, BoardTask, BoardView } from '@/features/tasks/queries';
import type { TaskPriority } from '@/lib/database.types';

interface Member {
  userId: string;
  name: string;
}

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  low: 'border-l-slate-300',
  medium: 'border-l-sky-400',
  high: 'border-l-amber-500',
  urgent: 'border-l-red-500',
};

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate).getTime() < new Date().setHours(0, 0, 0, 0);
}

export function KanbanBoard({
  projectId,
  board,
  members,
  canManage,
  reorderOnly = false,
  basePath = '/app/projects',
}: {
  projectId: string;
  board: BoardView;
  members: Member[];
  canManage: boolean;
  /** Allow drag-reordering WITHIN a column without full management rights
   *  (e.g. clients setting their processing order). No cross-column moves. */
  reorderOnly?: boolean;
  /** Route prefix for opening a task, e.g. '/app/projects' or '/portal/projects'. */
  basePath?: string;
}) {
  const router = useRouter();
  const canDrag = canManage || reorderOnly;
  const [columns, setColumns] = useState<BoardColumn[]>(board.columns);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const [dragOver, setDragOver] = useState<{
    columnId: string;
    taskId: string;
    after: boolean;
  } | null>(null);

  // Sync in freshly loaded server data (e.g. a newly added task) without
  // requiring a manual page refresh.
  useEffect(() => {
    setColumns(board.columns);
  }, [board]);

  // Filters
  const [assignee, setAssignee] = useState('all');
  const [priority, setPriority] = useState('all');
  const [labelFilter, setLabelFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyBlocked, setOnlyBlocked] = useState(false);

  // Distinct labels present on the board, for the filter dropdown.
  const availableLabels = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    for (const col of board.columns) {
      for (const task of col.tasks) {
        for (const l of task.labels) map.set(l.id, l);
      }
    }
    return [...map.values()];
  }, [board.columns]);

  const matchesFilters = useMemo(
    () =>
      (task: BoardTask): boolean => {
        if (priority !== 'all' && task.priority !== priority) return false;
        if (search && !task.title.toLowerCase().includes(search.toLowerCase()))
          return false;
        if (onlyOverdue && !isOverdue(task.dueDate)) return false;
        if (onlyBlocked && !task.isBlocked) return false;
        if (
          labelFilter !== 'all' &&
          !task.labels.some((l) => l.id === labelFilter)
        )
          return false;
        if (assignee === 'unassigned' && task.assignees.length > 0) return false;
        if (
          assignee !== 'all' &&
          assignee !== 'unassigned' &&
          !task.assignees.some((a) => a.userId === assignee)
        )
          return false;
        return true;
      },
    [assignee, priority, labelFilter, search, onlyOverdue, onlyBlocked],
  );

  function findTask(taskId: string): BoardTask | undefined {
    for (const col of columns) {
      const t = col.tasks.find((x) => x.id === taskId);
      if (t) return t;
    }
    return undefined;
  }

  /**
   * Moves `taskId` into `targetColumnId` at `insertIndex` (index within the
   * target column's tasks, excluding the moving task). Handles both
   * cross-column moves and same-column reordering; persists via move_task,
   * which stores a fractional position so order survives reloads.
   */
  async function moveTo(
    taskId: string,
    targetColumnId: string,
    insertIndex: number,
  ) {
    const task = findTask(taskId);
    if (!task) return;

    // Reorder-only mode (clients): never change a task's column/status.
    if (reorderOnly && task.columnId !== targetColumnId) return;

    const targetCol = columns.find((c) => c.id === targetColumnId);
    if (!targetCol) return;

    // Stage limit: if the active column is full, don't reject — reroute the
    // task to the TOP of the queue so nothing is silently blocked.
    if (
      targetCol.columnKey === 'active' &&
      task.columnId !== targetColumnId &&
      targetCol.wipLimit != null
    ) {
      const activeCount = targetCol.tasks.filter((t) => t.id !== taskId).length;
      if (activeCount >= targetCol.wipLimit) {
        const queue = columns.find((c) => c.columnKey === 'queue');
        if (queue) {
          await moveTo(taskId, queue.id, 0);
          setNotice(de.kanban.stageOverflow);
          return;
        }
      }
    }

    const others = targetCol.tasks
      .filter((t) => t.id !== taskId)
      .sort((a, b) => a.position - b.position);
    const idx = Math.max(0, Math.min(insertIndex, others.length));

    // Same column and same slot → nothing to do.
    if (task.columnId === targetColumnId) {
      const currentIdx = others.findIndex((t) => t.position > task.position);
      const currentSlot = currentIdx === -1 ? others.length : currentIdx;
      if (currentSlot === idx) return;
    }

    const newPosition = computeInsertPosition(
      others.map((t) => t.position),
      idx,
    );

    const previous = columns;
    const moved: BoardTask = {
      ...task,
      columnId: targetColumnId,
      position: newPosition,
      lockVersion: task.lockVersion + 1,
    };

    // Optimistic update: remove from old column, insert into target, re-sort.
    setColumns((cols) =>
      cols.map((col) => {
        if (col.id === task.columnId && col.id !== targetColumnId) {
          return { ...col, tasks: col.tasks.filter((t) => t.id !== taskId) };
        }
        if (col.id === targetColumnId) {
          const kept = col.tasks.filter((t) => t.id !== taskId);
          return {
            ...col,
            tasks: [...kept, moved].sort((a, b) => a.position - b.position),
          };
        }
        return col;
      }),
    );
    setError(null);
    setNotice(null);

    const fd = new FormData();
    fd.set('taskId', taskId);
    fd.set('targetColumnId', targetColumnId);
    fd.set('newPosition', String(newPosition));
    fd.set('expectedLockVersion', String(task.lockVersion));

    const result = await moveTaskAction(idleResult, fd);
    if (result.status === 'error') {
      setColumns(previous); // roll back
      setError(result.message);
    }
  }

  /** Drop over a card: insert before or after it depending on the cursor. */
  function handleDropOnTask(
    e: DragEvent,
    targetColumnId: string,
    targetTaskId: string,
  ) {
    e.preventDefault();
    e.stopPropagation();
    const taskId = dragTaskId;
    setDragTaskId(null);
    setDragOver(null);
    if (!taskId || taskId === targetTaskId) return;

    const targetCol = columns.find((c) => c.id === targetColumnId);
    if (!targetCol) return;
    const others = targetCol.tasks
      .filter((t) => t.id !== taskId)
      .sort((a, b) => a.position - b.position);
    const baseIndex = others.findIndex((t) => t.id === targetTaskId);
    if (baseIndex === -1) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY - rect.top > rect.height / 2;
    void moveTo(taskId, targetColumnId, after ? baseIndex + 1 : baseIndex);
  }

  /** Drop over the column background: append to the end of the column. */
  function handleDropOnColumn(targetColumnId: string) {
    const taskId = dragTaskId;
    setDragTaskId(null);
    setDragOver(null);
    if (!taskId) return;
    const targetCol = columns.find((c) => c.id === targetColumnId);
    if (!targetCol) return;
    const count = targetCol.tasks.filter((t) => t.id !== taskId).length;
    void moveTo(taskId, targetColumnId, count);
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert>{notice}</Alert>}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={de.kanban.search}
          className="h-9 w-48"
        />
        <Select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="h-9 w-auto"
        >
          <option value="all">{de.kanban.filterAssignee}: {de.kanban.all}</option>
          <option value="unassigned">{de.kanban.unassigned}</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </Select>
        <Select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="h-9 w-auto"
        >
          <option value="all">{de.kanban.filterPriority}: {de.kanban.all}</option>
          {(['urgent', 'high', 'medium', 'low'] as TaskPriority[]).map((p) => (
            <option key={p} value={p}>
              {de.priority[p]}
            </option>
          ))}
        </Select>
        {availableLabels.length > 0 && (
          <Select
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value)}
            className="h-9 w-auto"
          >
            <option value="all">
              {de.labels.filterLabel}: {de.kanban.all}
            </option>
            {availableLabels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={onlyOverdue}
            onChange={(e) => setOnlyOverdue(e.target.checked)}
          />
          {de.kanban.onlyOverdue}
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={onlyBlocked}
            onChange={(e) => setOnlyBlocked(e.target.checked)}
          />
          {de.kanban.onlyBlocked}
        </label>
      </div>

      {/* Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => {
          const visibleTasks = col.tasks
            .filter(matchesFilters)
            .slice()
            .sort((a, b) => a.position - b.position);
          const atLimit =
            col.wipLimit != null && col.tasks.length >= col.wipLimit;
          return (
            <div
              key={col.id}
              onDragOver={(e) => canDrag && e.preventDefault()}
              onDrop={() => canDrag && handleDropOnColumn(col.id)}
              className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/50 p-2"
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-semibold">{col.name}</span>
                <span
                  className={cn(
                    'text-xs',
                    atLimit ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {col.tasks.length}
                  {col.wipLimit != null ? `/${col.wipLimit}` : ''}
                  {col.wipLimitPerUser != null
                    ? ` · ${de.kanban.wipLimitPerUser} ${col.wipLimitPerUser}`
                    : ''}
                </span>
              </div>

              <div className="flex-1 space-y-2">
                {visibleTasks.map((task) => (
                  <div
                    key={task.id}
                    role="button"
                    tabIndex={0}
                    draggable={canDrag}
                    onPointerDown={(e) => {
                      pointerStart.current = { x: e.clientX, y: e.clientY };
                    }}
                    onDragStart={() => setDragTaskId(task.id)}
                    onDragEnd={() => setDragOver(null)}
                    onDragOver={(e) => {
                      if (!canDrag || !dragTaskId || dragTaskId === task.id)
                        return;
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const after = e.clientY - rect.top > rect.height / 2;
                      setDragOver({ columnId: col.id, taskId: task.id, after });
                    }}
                    onDrop={(e) => canDrag && handleDropOnTask(e, col.id, task.id)}
                    onClick={(e) => {
                      // Distinguish a real click from the click that fires at
                      // the end of a drag by how far the pointer travelled.
                      const start = pointerStart.current;
                      if (
                        start &&
                        Math.hypot(
                          e.clientX - start.x,
                          e.clientY - start.y,
                        ) > 6
                      ) {
                        return;
                      }
                      router.push(`${basePath}/${projectId}/tasks/${task.id}`);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(
                          `${basePath}/${projectId}/tasks/${task.id}`,
                        );
                      }
                    }}
                    className={cn(
                      'cursor-pointer rounded-md border-l-4 bg-background p-2 shadow-sm transition hover:shadow-md',
                      PRIORITY_CLASS[task.priority],
                      canDrag && 'active:cursor-grabbing',
                      dragOver?.taskId === task.id &&
                        !dragOver.after &&
                        'shadow-[inset_0_2px_0_0_hsl(var(--primary))]',
                      dragOver?.taskId === task.id &&
                        dragOver.after &&
                        'shadow-[inset_0_-2px_0_0_hsl(var(--primary))]',
                    )}
                  >
                    <div className="text-sm font-medium">{task.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                      {task.labels.map((l) => (
                        <LabelChip key={l.id} name={l.name} color={l.color} />
                      ))}
                      {task.isInternal && (
                        <span className="rounded bg-slate-200 px-1 py-0.5 text-slate-700">
                          {de.kanban.internal}
                        </span>
                      )}
                      {task.isBlocked && (
                        <span className="rounded bg-red-100 px-1 py-0.5 text-red-700">
                          {de.kanban.blocked}
                        </span>
                      )}
                      {task.dueDate && (
                        <span
                          className={cn(
                            'rounded px-1 py-0.5',
                            isOverdue(task.dueDate)
                              ? 'bg-red-100 text-red-700'
                              : 'bg-slate-100 text-slate-600',
                          )}
                        >
                          📅{' '}
                          {new Date(task.dueDate).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                          })}
                        </span>
                      )}
                      {task.assignees.map((a) => (
                        <span
                          key={a.userId}
                          className="flex items-center gap-1 rounded bg-primary/10 px-1 py-0.5 text-primary"
                        >
                          <Avatar
                            userId={a.userId}
                            name={a.name || '—'}
                            hasAvatar={a.hasAvatar}
                            size="sm"
                          />
                          {a.name || '—'}
                        </span>
                      ))}
                      {task.attachmentCount > 0 && (
                        <span
                          className="ml-auto flex items-center gap-0.5 text-muted-foreground"
                          title={de.kanban.attachments}
                        >
                          📎 {task.attachmentCount}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {canManage && (
                <AddTaskInline projectId={projectId} columnId={col.id} />
              )}
            </div>
          );
        })}

        {/* Archive column: last position, greyed out, review-only. */}
        <div className="flex w-72 shrink-0 flex-col rounded-lg border border-dashed bg-muted/20 p-2 opacity-80">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-muted-foreground">
              {de.kanban.archive}
            </span>
            <span className="text-xs text-muted-foreground">
              {board.archived.length}
            </span>
          </div>
          <div className="flex-1 space-y-2">
            {board.archived.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">
                {de.kanban.archiveEmpty}
              </p>
            ) : (
              board.archived.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() =>
                    router.push(`${basePath}/${projectId}/tasks/${task.id}`)
                  }
                  className="w-full rounded-md border-l-4 border-l-slate-300 bg-background/60 p-2 text-left shadow-sm hover:bg-background"
                >
                  <div className="text-sm font-medium text-muted-foreground line-through">
                    {task.title}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
