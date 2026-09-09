'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { startPrintBillingAction } from '@/features/print-billing/actions';

/**
 * Manueller Einstieg in die Drucksachen-Abrechnung, falls die automatische
 * Erkennung eine Aufgabe verpasst hat. Setzt den Status auf 'required', wodurch
 * die Zahler-Auswahl + der Rechnungs-Upload erscheinen.
 */
export function StartPrintBillingButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="rounded-lg border border-dashed p-3 text-sm">
      <div className="mb-2 text-muted-foreground">
        🖨️ Ist das ein Druckprodukt (Flyer, Visitenkarten, Plakate …)? Dann hier
        die Abrechnung starten – du legst danach fest, wer die Druckerei zahlt,
        und lädst Proforma + Endrechnung hoch.
      </div>
      <Button
        size="sm"
        variant="outline"
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await startPrintBillingAction(taskId);
            router.refresh();
          })
        }
      >
        Drucksachen-Abrechnung starten
      </Button>
    </div>
  );
}
