'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { moveTaskAction } from '@/features/tasks/actions';
import { AddTaskInline } from './add-task-inline';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { LabelChip } from '@/components/ui/label-chip';
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
}: {
  projectId: string;
  board: BoardView;
  members: Member[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [columns, setColumns] = useState<BoardColumn[]>(board.columns);
  const [error, setError] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [didDrag, setDidDrag] = useState(false);

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

  async function handleDrop(targetColumnId: string) {
    const taskId = dragTaskId;
    setDragTaskId(null);
    if (!taskId) return;
    const task = findTask(taskId);
    if (!task || task.columnId === targetColumnId) return;

    const previous = columns;
    const newPosition =
      Math.max(
        0,
        ...columns
          .find((c) => c.id === targetColumnId)!
          .tasks.map((t) => t.position),
      ) + 1000;

    // Optimistic move.
    setColumns((cols) =>
      cols.map((col) => {
        if (col.id === task.columnId) {
          return { ...col, tasks: col.tasks.filter((t) => t.id !== taskId) };
        }
        if (col.id === targetColumnId) {
          return {
            ...col,
            tasks: [
              ...col.tasks,
              {
                ...task,
                columnId: targetColumnId,
                position: newPosition,
                lockVersion: task.lockVersion + 1,
              },
            ],
          };
        }
        return col;
      }),
    );
    setError(null);

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

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}

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
          const visibleTasks = col.tasks.filter(matchesFilters);
          const atLimit =
            col.wipLimit != null && col.tasks.length >= col.wipLimit;
          return (
            <div
              key={col.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(col.id)}
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
                    draggable={canManage}
                    onDragStart={() => {
                      setDidDrag(true);
                      setDragTaskId(task.id);
                    }}
                    onDragEnd={() => {
                      // Reset after the click event would have fired, so a
                      // drag never triggers navigation.
                      setTimeout(() => setDidDrag(false), 0);
                    }}
                    onClick={() => {
                      if (didDrag) return;
                      router.push(
                        `/app/projects/${projectId}/tasks/${task.id}`,
                      );
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(
                          `/app/projects/${projectId}/tasks/${task.id}`,
                        );
                      }
                    }}
                    className={cn(
                      'cursor-pointer rounded-md border-l-4 bg-background p-2 shadow-sm transition hover:shadow-md',
                      PRIORITY_CLASS[task.priority],
                      canManage && 'active:cursor-grabbing',
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
                      {isOverdue(task.dueDate) && (
                        <span className="rounded bg-amber-100 px-1 py-0.5 text-amber-800">
                          {de.kanban.overdue}
                        </span>
                      )}
                      {task.assignees.map((a) => (
                        <span
                          key={a.userId}
                          className="rounded bg-primary/10 px-1 py-0.5 text-primary"
                        >
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
      </div>
    </div>
  );
}
