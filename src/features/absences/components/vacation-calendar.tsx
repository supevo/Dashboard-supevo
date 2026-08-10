'use client';

import { useMemo, useState } from 'react';
import type { VacationDay } from '@/features/absences/vacation-calendar';
import { de } from '@/lib/i18n/de';
import { cn } from '@/lib/utils';

interface Suggestion {
  start: string;
  end: string;
  reason: string;
}

const LEVEL_CLASS: Record<VacationDay['level'], string> = {
  green: 'bg-emerald-500 text-white',
  orange: 'bg-amber-400 text-amber-950',
  red: 'bg-rose-500 text-white',
  holiday: 'bg-indigo-400 text-white',
  weekend: 'bg-muted text-muted-foreground/60',
};

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function tooltip(d: VacationDay): string {
  if (d.holidayName) return `${d.holidayName} (Feiertag)`;
  const parts: string[] = [];
  if (d.absent > 0) parts.push(`${d.absent} abwesend`);
  if (d.deadlines > 0) parts.push(`${d.deadlines} Deadline${d.deadlines > 1 ? 's' : ''}`);
  if (d.events > 0) parts.push(`${d.events} Termin${d.events > 1 ? 'e' : ''}`);
  if (d.bridge) parts.push('Brückentag');
  return parts.length ? parts.join(' · ') : 'Frei – gute Zeit';
}

type VacationLength = 'few' | 'week' | 'twoweeks';

export function VacationCalendar({ days }: { days: VacationDay[] }) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [length, setLength] = useState<VacationLength>('week');
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const months = useMemo(() => {
    const byMonth = new Map<string, VacationDay[]>();
    for (const d of days) {
      const key = d.date.slice(0, 7); // YYYY-MM
      (byMonth.get(key) ?? byMonth.set(key, []).get(key)!).push(d);
    }
    return [...byMonth.entries()].map(([key, list]) => {
      const [y, m] = key.split('-').map(Number);
      const first = new Date(Date.UTC(y!, m! - 1, 1));
      const lead = (first.getUTCDay() + 6) % 7; // blanks before day 1 (Mon=0)
      return { key, label: `${MONTH_NAMES[m! - 1]} ${y}`, lead, list };
    });
  }, [days]);

  async function fetchSuggestion() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/absences/suggest?length=${length}`, {
        cache: 'no-store',
      });
      const data = (await res.json()) as { suggestion: Suggestion | null };
      if (data.suggestion) setSuggestion(data.suggestion);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  const inRec = (date: string) =>
    suggestion ? date >= suggestion.start && date <= suggestion.end : false;

  /** Writes the suggested range into the request form above (controlled
   *  inputs → native setter + input event so React picks up the change). */
  function applyToForm() {
    if (!suggestion) return;
    const setNative = (id: string, value: string, event: 'input' | 'change') => {
      const el = document.getElementById(id) as
        | HTMLInputElement
        | HTMLSelectElement
        | null;
      if (!el) return;
      const proto =
        el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
      el.dispatchEvent(new Event(event, { bubbles: true }));
    };
    setNative('type', 'urlaub', 'change');
    setNative('startDate', suggestion.start, 'input');
    setNative('endDate', suggestion.end, 'input');
    document
      .getElementById('startDate')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Dauer:</span>
          <select
            value={length}
            onChange={(e) => setLength(e.target.value as VacationLength)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="few">Ein paar Tage</option>
            <option value="week">1 Woche</option>
            <option value="twoweeks">2 Wochen</option>
          </select>
        </label>
        <button
          type="button"
          onClick={fetchSuggestion}
          disabled={loading}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {loading ? de.common.loading : `✨ ${de.absence.vacationSuggest}`}
        </button>
        {suggestion && (
          <>
            <p className="text-sm">
              <span className="font-semibold">
                {suggestion.start.split('-').reverse().join('.')}–
                {suggestion.end.split('-').reverse().join('.')}:
              </span>{' '}
              <span className="text-muted-foreground">{suggestion.reason}</span>
            </p>
            <button
              type="button"
              onClick={applyToForm}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              {de.absence.suggestApply}
            </button>
          </>
        )}
        {failed && (
          <p className="text-xs text-muted-foreground">{de.absence.suggestError}</p>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <Legend cls="bg-emerald-500" label={de.absence.legendGood} />
        <Legend cls="bg-amber-400" label={de.absence.legendMedium} />
        <Legend cls="bg-rose-500" label={de.absence.legendBad} />
        <Legend cls="bg-indigo-400" label={de.absence.legendHoliday} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {months.map((month) => (
          <div key={month.key}>
            <div className="mb-1.5 text-sm font-semibold">{month.label}</div>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-center text-[10px] text-muted-foreground">
                  {w}
                </div>
              ))}
              {Array.from({ length: month.lead }).map((_, i) => (
                <div key={`lead-${i}`} />
              ))}
              {month.list.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date.split('-').reverse().join('.')} – ${tooltip(d)}`}
                  className={cn(
                    'flex h-7 items-center justify-center rounded text-[11px]',
                    LEVEL_CLASS[d.level],
                    inRec(d.date) && 'ring-2 ring-offset-1 ring-primary',
                  )}
                >
                  {Number(d.date.slice(8, 10))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-3 w-3 rounded', cls)} />
      {label}
    </span>
  );
}
