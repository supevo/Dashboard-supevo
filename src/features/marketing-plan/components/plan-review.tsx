'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  clientAcceptItemAction,
  clientRequestChangeAction,
  clientAcceptWholePlanAction,
} from '@/features/marketing-plan/actions';
import type { MarketingPlan, PlanItem } from '@/features/marketing-plan/queries';
import { MONTHS } from '@/features/marketing-plan/components/plan-manager';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';

function ItemRow({ item }: { item: PlanItem }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [changing, setChanging] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const accepted = item.status === 'accepted' || item.status === 'embedded';

  const accept = () =>
    start(async () => {
      setError(null);
      const res = await clientAcceptItemAction(item.id);
      if (res.status === 'error') setError(res.message);
      router.refresh();
    });

  const sendChange = () =>
    start(async () => {
      setError(null);
      const res = await clientRequestChangeAction({ itemId: item.id, note });
      if (res.status === 'error') {
        setError(res.message);
        return;
      }
      setChanging(false);
      setNote('');
      router.refresh();
    });

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{item.title}</div>
          {item.description && (
            <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
              {item.description}
            </p>
          )}
          {item.status === 'change_requested' && item.clientNote && (
            <p className="mt-1 rounded bg-amber-500/10 p-1.5 text-xs text-amber-700 dark:text-amber-300">
              Dein Änderungswunsch: {item.clientNote}
            </p>
          )}
        </div>
        {accepted ? (
          <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            ✓ Akzeptiert
          </span>
        ) : (
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="outline" disabled={pending} onClick={accept}>
              Akzeptieren
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setChanging((v) => !v)}
            >
              Änderung
            </Button>
          </div>
        )}
      </div>

      {changing && !accepted && (
        <div className="mt-2 space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Was möchtest du an dieser Maßnahme ändern?"
            maxLength={2000}
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={pending || note.trim().length < 2} onClick={sendChange}>
              Änderungswunsch senden
            </Button>
          </div>
        </div>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}
    </li>
  );
}

export function PlanReview({ plan }: { plan: MarketingPlan }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const byMonth = new Map<number, PlanItem[]>();
  for (const it of plan.items) {
    byMonth.set(it.month, [...(byMonth.get(it.month) ?? []), it]);
  }
  const months = [...byMonth.keys()].sort((a, b) => a - b);
  const allDecided = plan.items.every(
    (i) => i.status === 'accepted' || i.status === 'embedded',
  );

  const acceptAll = () =>
    start(async () => {
      await clientAcceptWholePlanAction(plan.id);
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Euer Marketingplan {plan.year}. Akzeptiere die einzelnen Maßnahmen oder
          wünsche Änderungen – oder nimm gleich den ganzen Plan an.
        </p>
        {plan.status !== 'accepted' && plan.items.length > 0 && (
          <Button size="sm" disabled={pending} onClick={acceptAll}>
            Ganzen Plan akzeptieren
          </Button>
        )}
      </div>

      {plan.status === 'accepted' && (
        <Alert variant="success">
          Plan akzeptiert – wir setzen die Maßnahmen wie besprochen um. Danke!
        </Alert>
      )}
      {plan.status !== 'accepted' && allDecided && plan.items.length > 0 && (
        <Alert variant="default">
          Alle Maßnahmen akzeptiert. Du kannst den Plan oben final annehmen.
        </Alert>
      )}

      {months.map((m) => (
        <div key={m}>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {MONTHS[m - 1]}
          </div>
          <ul className="space-y-2">
            {(byMonth.get(m) ?? []).map((it) => (
              <ItemRow key={it.id} item={it} />
            ))}
          </ul>
        </div>
      ))}

      {plan.items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Der Plan wird gerade vorbereitet.
        </p>
      )}
    </div>
  );
}
