import { Avatar } from '@/components/ui/avatar';
import type { TaskActivityEntry, TaskViewStat } from '@/features/tasks/activity';
import type { ActivityAction } from '@/lib/database.types';
import { de } from '@/lib/i18n/de';

const ACTION_LABEL: Partial<Record<ActivityAction, string>> = {
  create: 'erstellt',
  update: 'aktualisiert',
  status_change: 'verschoben',
  archive: 'archiviert',
  assignee_change: 'Zuständigkeit geändert',
  due_date_change: 'Fälligkeit geändert',
  file_upload: 'Datei hochgeladen',
  comment: 'kommentiert',
  approval_request: 'Freigabe angefragt',
  approval_decision: 'Freigabe entschieden',
  delete: 'gelöscht',
};

function dt(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dwell(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export function TaskActivityLog({
  activity,
  viewStats,
}: {
  activity: TaskActivityEntry[];
  viewStats: TaskViewStat[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
          {de.taskLog.views}
        </div>
        {viewStats.length === 0 ? (
          <p className="text-sm text-muted-foreground">{de.taskLog.noViews}</p>
        ) : (
          <ul className="space-y-2">
            {viewStats.map((v) => (
              <li key={v.userId} className="flex items-center gap-2 text-sm">
                <Avatar userId={v.userId} name={v.name} hasAvatar={false} size="sm" />
                <span className="min-w-0 flex-1 truncate">{v.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {de.taskLog.lastSeen}: {dt(v.lastSeen)} · {v.views}×
                  {v.dwellSeconds > 0 ? ` · ${dwell(v.dwellSeconds)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t pt-3">
        <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
          {de.taskLog.changes}
        </div>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">{de.taskLog.noChanges}</p>
        ) : (
          <ul className="space-y-1.5">
            {activity.map((a) => (
              <li key={a.id} className="text-sm">
                <span className="font-medium">{a.actorName}</span>{' '}
                {ACTION_LABEL[a.action] ?? a.action}
                {a.column ? ` → ${a.column}` : ''}
                <span className="ml-1 text-xs text-muted-foreground">{dt(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
