'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { syncOfferFromLeadAction } from '@/features/leads/actions';

/**
 * Agentur-Knopf auf der Kundenseite: übernimmt das Angebot des verknüpften Leads
 * 1:1 in die Mitgliedschaft (Module inkl. Mengen, Preis, Gutscheine). Zeigt das
 * Ergebnis – oder klar, dass kein Lead verknüpft ist.
 */
export function SyncOfferFromLeadButton({
  clientCompanyId,
}: {
  clientCompanyId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function run() {
    setMsg(null);
    start(async () => {
      const res = await syncOfferFromLeadAction(clientCompanyId);
      if (res.status === 'success') {
        setMsg({ ok: true, text: res.message ?? 'Übernommen.' });
        router.refresh();
      } else {
        setMsg({ ok: false, text: 'message' in res ? res.message : 'Fehlgeschlagen.' });
      }
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-sm font-medium">🔄 Angebot vom Lead übernehmen</p>
      <p className="text-xs text-muted-foreground">
        Übernimmt Module (inkl. Mengen), Preis und eingelöste Gutscheine 1:1 aus
        dem verknüpften Lead in diese Mitgliedschaft.
      </p>
      <Button type="button" onClick={run} disabled={pending}>
        {pending ? 'Übernehme …' : 'Jetzt übernehmen'}
      </Button>
      {msg && (
        <p
          className={`text-sm ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
