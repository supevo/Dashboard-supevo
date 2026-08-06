'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { switchPortalStageAction } from '@/features/billing/portal-actions';
import { idleResult } from '@/lib/action-result';
import { formatEuroCents } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { PortalMembershipView } from '@/features/billing/portal';

function BenefitList({ benefits }: { benefits: string[] }) {
  if (benefits.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1">
      {benefits.map((b) => (
        <li key={b} className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <span className="mt-0.5 text-emerald-600 dark:text-emerald-400">✓</span>
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

function PackageCard({
  name,
  priceCents,
  stage,
  current,
  effectiveCents,
  benefits,
  onSwitch,
}: {
  name: string;
  priceCents: number;
  stage: number;
  current: boolean;
  effectiveCents: number;
  benefits: string[];
  onSwitch: (stage: number) => void;
}) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border p-4',
        current && 'border-primary ring-1 ring-primary',
      )}
    >
      <div className="text-sm font-semibold">{name}</div>
      <div className="mt-1 text-2xl font-bold">{formatEuroCents(priceCents)}</div>
      <div className="text-xs text-muted-foreground">zzgl. MwSt / Monat</div>

      <BenefitList benefits={benefits} />

      <div className="mt-auto pt-3">
        {current ? (
          <span className="inline-block rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            Ihr aktuelles Paket
            {effectiveCents !== priceCents
              ? ` · Ihr Preis: ${formatEuroCents(effectiveCents)}`
              : ''}
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onSwitch(stage)}
          >
            Auf {name} wechseln
          </Button>
        )}
      </div>
    </div>
  );
}

export function PortalMembership({ view }: { view: PortalMembershipView }) {
  const [state, formAction] = useActionState(switchPortalStageAction, idleResult);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [submitStage, setSubmitStage] = useState<number | null>(null);
  // Stage the client wants to downgrade to (opens the confirmation dialog).
  const [confirmStage, setConfirmStage] = useState<number | null>(null);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  // Submit once the hidden stage input has rendered the chosen value.
  useEffect(() => {
    if (submitStage != null) {
      formRef.current?.requestSubmit();
      setSubmitStage(null);
    }
  }, [submitStage]);

  const {
    membership,
    stage1Name,
    stage1Cents,
    stage2Name,
    stage2Cents,
    stage1Benefits,
    stage2Benefits,
  } = view;

  const benefitsByStage: Record<number, string[]> = {
    1: stage1Benefits,
    2: stage2Benefits,
  };
  const nameByStage: Record<number, string> = { 1: stage1Name, 2: stage2Name };

  function requestSwitch(stage: number) {
    // Downgrade (to a lower stage) → confirm and show lost benefits first.
    if (stage < membership.stage) {
      setConfirmStage(stage);
    } else {
      setSubmitStage(stage);
    }
  }

  // Benefits the client would lose: in the current (higher) package but not in
  // the target (lower) one.
  const currentBenefits = benefitsByStage[membership.stage] ?? [];
  const targetBenefits = confirmStage ? benefitsByStage[confirmStage] ?? [] : [];
  const lostBenefits = currentBenefits.filter(
    (b) => !targetBenefits.some((t) => t.toLowerCase() === b.toLowerCase()),
  );
  const targetName = confirmStage ? nameByStage[confirmStage] : '';

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

      {/* Hidden form driving the server action. */}
      <form ref={formRef} action={formAction} className="hidden">
        <input type="hidden" name="stage" value={submitStage ?? ''} readOnly />
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        <PackageCard
          name={stage1Name}
          priceCents={stage1Cents}
          stage={1}
          current={membership.stage === 1}
          effectiveCents={view.effectiveCents}
          benefits={stage1Benefits}
          onSwitch={requestSwitch}
        />
        <PackageCard
          name={stage2Name}
          priceCents={stage2Cents}
          stage={2}
          current={membership.stage === 2}
          effectiveCents={view.effectiveCents}
          benefits={stage2Benefits}
          onSwitch={requestSwitch}
        />
      </div>

      {view.isCustom && (
        <p className="text-xs text-muted-foreground">
          Für Sie gilt aktuell ein individuell vereinbarter Preis von{' '}
          {formatEuroCents(view.effectiveCents)}.
        </p>
      )}

      <Modal
        open={confirmStage != null}
        onClose={() => setConfirmStage(null)}
        title={`Wechsel auf „${targetName}“ bestätigen`}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sie stufen von „{nameByStage[membership.stage]}“ auf „{targetName}“
            herab. Diese Änderung müssen Sie bestätigen.
          </p>

          {lostBenefits.length > 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
              <div className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Diese Vorteile verlieren Sie:
              </div>
              <ul className="mt-2 space-y-1">
                {lostBenefits.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-1.5 text-sm text-amber-800 dark:text-amber-200"
                  >
                    <span className="mt-0.5">✕</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Für das kleinere Paket sind keine Leistungen hinterlegt. Bitte
              bestätigen Sie den Wechsel.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmStage(null)}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const s = confirmStage;
                setConfirmStage(null);
                if (s != null) setSubmitStage(s);
              }}
            >
              Herabstufung bestätigen
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
