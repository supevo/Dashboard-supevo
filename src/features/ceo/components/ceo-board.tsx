'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  createCeoTaskAction,
  updateCeoTaskAction,
  moveCeoTaskAction,
  deleteCeoTaskAction,
} from '@/features/ceo/actions';
import {
  CEO_COLUMNS,
  CEO_STATUSES,
  QUADRANTS,
  ENERGIES,
  AREA_SUGGESTIONS,
  FOCUS_TARGET_MIN,
  quadrantMeta,
  formatMinutes,
  type CeoTask,
  type CeoStatus,
} from '@/features/ceo/types';

function berlinToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function dueBadge(due: string | null): { label: string; tone: string } | null {
  if (!due) return null;
  const today = berlinToday();
  const label = new Date(due + 'T00:00:00').toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
  });
  if (due < today) return { label: `${label} · überfällig`, tone: 'text-rose-600 dark:text-rose-400' };
  if (due === today) return { label: 'heute fällig', tone: 'text-amber-600 dark:text-amber-400' };
  return { label, tone: 'text-muted-foreground' };
}

interface FormValues {
  title: string;
  notes: string;
  area: string;
  quadrant: number | null;
  energy: 'deep' | 'shallow' | null;
  estimateMin: number | null;
  dueDate: string;
}

function emptyForm(): FormValues {
  return {
    title: '',
    notes: '',
    area: '',
    quadrant: null,
    energy: null,
    estimateMin: null,
    dueDate: '',
  };
}

/** Gemeinsames Feld-Formular für Anlegen und Bearbeiten. */
function CardForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: FormValues;
  submitLabel: string;
  pending: boolean;
  onSubmit: (v: FormValues) => void;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<FormValues>(initial);

  return (
    <form
      className="space-y-2 rounded-lg border bg-background p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.title.trim() || pending) return;
        onSubmit(v);
      }}
    >
      <Input
        autoFocus
        value={v.title}
        onChange={(e) => setV({ ...v, title: e.target.value })}
        placeholder="Was steht an? (Titel)"
        required
      />
      <Textarea
        value={v.notes}
        onChange={(e) => setV({ ...v, notes: e.target.value })}
        rows={2}
        placeholder="Notiz (optional)"
        className="text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Eisenhower</Label>
          <Select
            value={v.quadrant ?? ''}
            onChange={(e) =>
              setV({ ...v, quadrant: e.target.value ? Number(e.target.value) : null })
            }
            className="h-9"
          >
            <option value="">– wählen –</option>
            {QUADRANTS.map((q) => (
              <option key={q.value} value={q.value}>
                {q.short} · {q.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Energie</Label>
          <Select
            value={v.energy ?? ''}
            onChange={(e) =>
              setV({
                ...v,
                energy: (e.target.value || null) as 'deep' | 'shallow' | null,
              })
            }
            className="h-9"
          >
            <option value="">– wählen –</option>
            {ENERGIES.map((en) => (
              <option key={en.value} value={en.value}>
                {en.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Bereich</Label>
          <Input
            list="ceo-areas"
            value={v.area}
            onChange={(e) => setV({ ...v, area: e.target.value })}
            placeholder="z. B. Vertrieb"
            className="h-9"
          />
          <datalist id="ceo-areas">
            {AREA_SUGGESTIONS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Aufwand (Min.)</Label>
          <Input
            type="number"
            min={0}
            step={5}
            value={v.estimateMin ?? ''}
            onChange={(e) =>
              setV({ ...v, estimateMin: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="z. B. 45"
            className="h-9"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Fällig am</Label>
          <Input
            type="date"
            value={v.dueDate}
            onChange={(e) => setV({ ...v, dueDate: e.target.value })}
            className="h-9"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !v.title.trim()}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
        )}
      </div>
    </form>
  );
}

function TaskCard({
  task,
  pending,
  onMove,
  onEdit,
  onDelete,
}: {
  task: CeoTask;
  pending: boolean;
  onMove: (dir: -1 | 1) => void;
  onEdit: (v: FormValues) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const q = quadrantMeta(task.quadrant);
  const due = dueBadge(task.dueDate);
  const statusIdx = CEO_STATUSES.indexOf(task.status);
  const energy = ENERGIES.find((e) => e.value === task.energy);

  if (editing) {
    return (
      <CardForm
        initial={{
          title: task.title,
          notes: task.notes ?? '',
          area: task.area ?? '',
          quadrant: task.quadrant,
          energy: task.energy,
          estimateMin: task.estimateMin,
          dueDate: task.dueDate ?? '',
        }}
        submitLabel="Speichern"
        pending={pending}
        onSubmit={(v) => {
          onEdit(v);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      className={cn(
        'group space-y-2 rounded-lg border bg-background p-3 text-sm shadow-sm',
        task.status === 'done' && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn('font-medium leading-snug', task.status === 'done' && 'line-through')}>
          {task.title}
        </p>
        <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            title="Bearbeiten"
            onClick={() => setEditing(true)}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Löschen"
            onClick={onDelete}
            disabled={pending}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {task.notes && (
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">{task.notes}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {q && (
          <span
            className={cn('rounded border px-1.5 py-0.5 font-medium', q.badge)}
            title={q.hint}
          >
            {q.short} · {q.label}
          </span>
        )}
        {task.area && (
          <span className="rounded border bg-muted/40 px-1.5 py-0.5 text-muted-foreground">
            {task.area}
          </span>
        )}
        {energy && (
          <span
            className="rounded border bg-muted/40 px-1.5 py-0.5 text-muted-foreground"
            title={energy.hint}
          >
            {energy.label}
          </span>
        )}
        {task.estimateMin != null && (
          <span className="rounded border bg-muted/40 px-1.5 py-0.5 text-muted-foreground">
            ⏱ {formatMinutes(task.estimateMin)}
          </span>
        )}
        {due && <span className={cn('px-0.5 font-medium', due.tone)}>{due.label}</span>}
      </div>

      <div className="flex items-center justify-between pt-0.5">
        <button
          type="button"
          title="Nach links"
          disabled={pending || statusIdx <= 0}
          onClick={() => onMove(-1)}
          className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Nach rechts"
          disabled={pending || statusIdx >= CEO_STATUSES.length - 1}
          onClick={() => onMove(1)}
          className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function CeoBoard({ tasks }: { tasks: CeoTask[] }) {
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  const byStatus = useMemo(() => {
    const map: Record<CeoStatus, CeoTask[]> = {
      backlog: [],
      today: [],
      doing: [],
      done: [],
    };
    for (const t of tasks) map[t.status]?.push(t);
    return map;
  }, [tasks]);

  // Für heute geplant = Spalten „Heute" + „In Arbeit".
  const plannedMin = useMemo(
    () =>
      [...byStatus.today, ...byStatus.doing].reduce(
        (sum, t) => sum + (t.estimateMin ?? 0),
        0,
      ),
    [byStatus],
  );
  const pct = Math.min(100, Math.round((plannedMin / FOCUS_TARGET_MIN) * 100));
  const over = plannedMin > FOCUS_TARGET_MIN;
  const near = !over && plannedMin >= FOCUS_TARGET_MIN * 0.85;
  const barTone = over ? 'bg-rose-500' : near ? 'bg-amber-500' : 'bg-emerald-500';

  function create(v: FormValues) {
    start(async () => {
      await createCeoTaskAction({
        title: v.title,
        notes: v.notes,
        status: 'today',
        quadrant: v.quadrant,
        energy: v.energy,
        area: v.area,
        estimateMin: v.estimateMin,
        dueDate: v.dueDate,
      });
      setAdding(false);
      router.refresh();
    });
  }

  function move(task: CeoTask, dir: -1 | 1) {
    const idx = CEO_STATUSES.indexOf(task.status) + dir;
    const next = CEO_STATUSES[idx];
    if (!next) return;
    start(async () => {
      await moveCeoTaskAction(task.id, next);
      router.refresh();
    });
  }

  function edit(task: CeoTask, v: FormValues) {
    start(async () => {
      await updateCeoTaskAction(task.id, {
        title: v.title,
        notes: v.notes,
        quadrant: v.quadrant,
        energy: v.energy,
        area: v.area,
        estimateMin: v.estimateMin,
        dueDate: v.dueDate,
      });
      router.refresh();
    });
  }

  function remove(task: CeoTask) {
    start(async () => {
      await deleteCeoTaskAction(task.id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Tages-Kapazität */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Für heute geplant</span>
          <span className={cn('tabular-nums', over && 'font-semibold text-rose-600')}>
            {formatMinutes(plannedMin)} / {formatMinutes(FOCUS_TARGET_MIN)} Fokus
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full transition-all', barTone)} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {over
            ? 'Über deinem Fokus-Rahmen – schieb etwas ins Backlog, delegiere (Q3) oder streiche (Q4).'
            : near
              ? 'Fast voll – der Tag ist gut gefüllt.'
              : '~5 h fokussierte Arbeit, der Rest deines 8-h-Tages ist Puffer für Meetings & Rückfragen.'}
        </p>
      </div>

      {/* Neue Karte */}
      {adding ? (
        <CardForm
          initial={emptyForm()}
          submitLabel="Karte anlegen"
          pending={pending}
          onSubmit={create}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-4 w-4" /> Neue Karte
        </Button>
      )}

      {/* Board */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {CEO_COLUMNS.map((col) => {
          const items = byStatus[col.key];
          const colMin = items.reduce((s, t) => s + (t.estimateMin ?? 0), 0);
          return (
            <div key={col.key} className="flex flex-col rounded-lg border bg-muted/20">
              <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-semibold">
                <span>{col.label}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {items.length}
                  {colMin > 0 && ` · ${formatMinutes(colMin)}`}
                </span>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {items.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                    Keine Karten
                  </p>
                ) : (
                  items.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      pending={pending}
                      onMove={(dir) => move(t, dir)}
                      onEdit={(v) => edit(t, v)}
                      onDelete={() => remove(t)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
