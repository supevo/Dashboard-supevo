'use client';

import { useMemo, useState } from 'react';
import { formatBerlinDateTime } from '@/lib/time';
import type { ChoreHistoryEntry } from '@/features/office-chores/queries';

const STATUS_META: Record<string, { label: string; className: string }> = {
  verified: { label: '✅ Bestätigt', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  done: { label: '⏳ Wartet auf Kontrolle', className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  rejected: { label: '↩ Zurückgewiesen', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  assigned: { label: '🕒 Offen', className: 'bg-muted text-muted-foreground' },
  missed: { label: '⚠️ Verpasst', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
};

/** Berlin-Tagesüberschrift, z. B. „Montag, 15. September 2025". */
function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

/**
 * Rückwirkende Admin-Übersicht des Ordnungsdiensts: wer hat welchen Checkpunkt
 * erledigt, wer hat kontrolliert, wann – gruppiert nach Tag, filterbar nach
 * Person und Status.
 */
export function ChoreHistory({ entries }: { entries: ChoreHistoryEntry[] }) {
  const [person, setPerson] = useState('all');
  const [status, setStatus] = useState('all');

  const people = useMemo(
    () => [...new Set(entries.map((e) => e.assigneeName))].sort((a, b) => a.localeCompare(b)),
    [entries],
  );

  const filtered = useMemo(
    () =>
      entries.filter(
        (e) =>
          (person === 'all' || e.assigneeName === person) &&
          (status === 'all' || e.status === status),
      ),
    [entries, person, status],
  );

  const groups = useMemo(() => {
    const map = new Map<string, ChoreHistoryEntry[]>();
    for (const e of filtered) {
      const key = dayLabel(e.activityAt);
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return [...map.entries()];
  }, [filtered]);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Noch kein Ordnungsdienst erfasst.
      </p>
    );
  }

  const selectClass =
    'rounded-md border bg-background px-2 py-1.5 text-sm';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          className={selectClass}
          aria-label="Person"
        >
          <option value="all">Alle Personen</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={selectClass}
          aria-label="Status"
        >
          <option value="all">Alle Status</option>
          <option value="verified">✅ Bestätigt</option>
          <option value="done">⏳ Wartet auf Kontrolle</option>
          <option value="rejected">↩ Zurückgewiesen</option>
          <option value="assigned">🕒 Offen</option>
          <option value="missed">⚠️ Verpasst</option>
        </select>
        <span className="text-xs text-muted-foreground">
          {filtered.length} Einträge
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine Einträge für diese Auswahl.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map(([day, items]) => (
            <div key={day}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {day}
              </div>
              <ul className="divide-y rounded-lg border">
                {items.map((e) => {
                  const meta = STATUS_META[e.status] ?? {
                    label: e.status,
                    className: 'bg-muted text-muted-foreground',
                  };
                  return (
                    <li
                      key={e.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{e.text}</div>
                        <div className="text-xs text-muted-foreground">
                          erledigt von {e.assigneeName}
                          {e.verifierName
                            ? ` · geprüft von ${e.verifierName}`
                            : ' · ohne Kontrolle'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatBerlinDateTime(e.activityAt)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
