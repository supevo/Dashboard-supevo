'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { switchPortalStageAction } from '@/features/billing/portal-actions';
import { idleResult } from '@/lib/action-result';
import { formatEuroCents } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import type { PortalMembershipView } from '@/features/billing/portal';

function PackageCard({
  name,
  priceCents,
  stage,
  current,
  effectiveCents,
}: {
  name: string;
  priceCents: number;
  stage: number;
  current: boolean;
  effectiveCents: number;
}) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border p-4',
        current && 'border-primary ring-1 ring-primary',
      )}
    >
      <div className="text-sm font-semibold">{name}</div>
      <div className="mt-1 text-2xl font-bold">
        {formatEuroCents(priceCents)}
      </div>
      <div className="text-xs text-muted-foreground">zzgl. MwSt / Monat</div>

      <div className="mt-3">
        {current ? (
          <span className="inline-block rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            Ihr aktuelles Paket
            {effectiveCents !== priceCents
              ? ` · Ihr Preis: ${formatEuroCents(effectiveCents)}`
              : ''}
          </span>
        ) : (
          <SubmitButton size="sm" variant="outline" name="stage" value={stage}>
            Auf {name} wechseln
          </SubmitButton>
        )}
      </div>
    </div>
  );
}

export function PortalMembership({ view }: { view: PortalMembershipView }) {
  const [state, formAction] = useActionState(
    switchPortalStageAction,
    idleResult,
  );
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  const { membership, stage1Name, stage1Cents, stage2Name, stage2Cents } = view;

  return (
    <div className="space-y-3">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && <Alert>{state.message}</Alert>}

      <p className="text-sm text-muted-foreground">
        Sie können jederzeit das Paket wechseln. Beim Wechsel auf ein höheres
        Paket ändert sich der monatliche Preis entsprechend.
      </p>

      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        <PackageCard
          name={stage1Name}
          priceCents={stage1Cents}
          stage={1}
          current={membership.stage === 1}
          effectiveCents={view.effectiveCents}
        />
        <PackageCard
          name={stage2Name}
          priceCents={stage2Cents}
          stage={2}
          current={membership.stage === 2}
          effectiveCents={view.effectiveCents}
        />
      </form>

      {view.isCustom && (
        <p className="text-xs text-muted-foreground">
          Für Sie gilt aktuell ein individuell vereinbarter Preis von{' '}
          {formatEuroCents(view.effectiveCents)}.
        </p>
      )}
    </div>
  );
}
