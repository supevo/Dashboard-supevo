import { cn } from '@/lib/utils';

const STEPS = [
  { n: 1, label: 'Kundendaten' },
  { n: 2, label: 'Mitgliedschaft / Preis' },
  { n: 3, label: 'Vertrag & Onboarding' },
];

/** Progress header for the guided "Neuer Kunde" wizard. */
export function WizardSteps({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((s, i) => {
        const done = s.n < current;
        const active = s.n === current;
        return (
          <li key={s.n} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                done
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/30 text-muted-foreground',
              )}
            >
              {done ? '✓' : s.n}
            </span>
            <span className={cn(active ? 'font-medium' : 'text-muted-foreground')}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="mx-1 text-muted-foreground/40">→</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
