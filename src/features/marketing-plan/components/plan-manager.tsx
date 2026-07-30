'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createPlanAction,
  addPlanItemAction,
  deletePlanItemAction,
  releasePlanAction,
  embedPlanAction,
} from '@/features/marketing-plan/actions';
import type { MarketingPlan } from '@/features/marketing-plan/queries';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import type { ActionResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';

export const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  proposed: { label: 'Vorgeschlagen', cls: 'bg-muted text-muted-foreground' },
  change_requested: { label: 'Änderung gewünscht', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  accepted: { label: 'Akzeptiert', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  embedded: { label: 'Im Kanban', cls: 'bg-primary/15 text-primary' },
};

const PLAN_STATUS: Record<string, string> = {
  draft: '📝 Entwurf',
  in_review: '🔄 Beim Kunden zur Abstimmung',
  accepted: '✅ Akzeptiert',
};

export function PlanManager({
  clientCompanyId,
  plan,
  year,
}: {
  clientCompanyId: string;
  plan: MarketingPlan | null;
  year: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Neue Maßnahme
  const [month, setMonth] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.status === 'error') setError(res.message);
      router.refresh();
    });

  if (!plan) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Noch kein Marketingplan für {year}. Lege einen an, füge Maßnahmen pro
          Monat hinzu und gib ihn dem Kunden zur Abstimmung frei.
        </p>
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(() => createPlanAction({ clientCompanyId, year }))}
        >
          Plan {year} anlegen
        </Button>
      </div>
    );
  }

  const addDisabled = pending || title.trim().length < 2;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{PLAN_STATUS[plan.status] ?? plan.status}</span>
        <div className="flex gap-2">
          {plan.status === 'draft' && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending || plan.items.length === 0}
              onClick={() => run(() => releasePlanAction(plan.id))}
            >
              Zur Abstimmung freigeben
            </Button>
          )}
          <Button
            size="sm"
            disabled={pending || plan.items.length === 0}
            onClick={() => run(() => embedPlanAction(plan.id))}
            title="Akzeptierte (bzw. offene) Maßnahmen als Kanban-Aufgaben übernehmen"
          >
            Ins Kanban übernehmen
          </Button>
        </div>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {plan.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Maßnahmen.</p>
      ) : (
        <ul className="space-y-2">
          {plan.items.map((it) => {
            const chip = STATUS_CHIP[it.status];
            return (
              <li key={it.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-muted-foreground">
                      {MONTHS[it.month - 1]}
                    </div>
                    <div className="text-sm font-semibold">{it.title}</div>
                    {it.description && (
                      <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                        {it.description}
                      </p>
                    )}
                    {it.clientNote && (
                      <p className="mt-1 rounded bg-amber-500/10 p-1.5 text-xs text-amber-700 dark:text-amber-300">
                        Kundenwunsch: {it.clientNote}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {chip && (
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', chip.cls)}>
                        {chip.label}
                      </span>
                    )}
                    {it.status !== 'embedded' && (
                      <button
                        type="button"
                        disabled={pending}
                        aria-label="Löschen"
                        onClick={() => run(() => deletePlanItemAction(it.id))}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Maßnahme hinzufügen */}
      <div className="space-y-2 rounded-lg border p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Maßnahme hinzufügen
        </div>
        <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
          <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </Select>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titel der Maßnahme"
            maxLength={200}
          />
        </div>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Beschreibung (optional)"
          maxLength={4000}
        />
        <Button
          size="sm"
          disabled={addDisabled}
          onClick={() =>
            run(async () => {
              const res = await addPlanItemAction({
                planId: plan.id,
                month,
                title,
                description,
              });
              if (res.status === 'success') {
                setTitle('');
                setDescription('');
              }
              return res;
            })
          }
        >
          Hinzufügen
        </Button>
      </div>
    </div>
  );
}
