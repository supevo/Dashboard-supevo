'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runPrintInvoicesNowAction } from '@/features/print-billing/actions';

/**
 * Super-Admin-Knopf: erzeugt die Druck-Sammelrechnungen (Entwürfe) sofort, ohne
 * auf den Monats-Cron zu warten. Für Test und Ad-hoc-Abrechnung.
 */
export function GeneratePrintInvoicesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMsg(null);
            const res = await runPrintInvoicesNowAction();
            if (!res.ok) {
              setMsg(res.error);
              return;
            }
            setMsg(
              res.invoicesCreated === 0
                ? 'Keine offenen Druckaufträge zum Abrechnen.'
                : `${res.invoicesCreated} Rechnungsentwurf/-entwürfe aus ${res.expensesBilled} Druckauftrag/-aufträgen erstellt.`,
            );
            router.refresh();
          })
        }
        className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        title="Erzeugt pro Kunde einen Rechnungsentwurf aus allen noch offenen Druck-Belegen"
      >
        {pending ? 'Erzeuge …' : '🧾 Sammelrechnungen erzeugen'}
      </button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}
