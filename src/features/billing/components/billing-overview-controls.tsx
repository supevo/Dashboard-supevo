'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  generateAllDraftsAction,
  toggleSepaSubmittedAction,
} from '@/features/billing/invoice-actions';
import { Button } from '@/components/ui/button';

/** Erstellt für alle aktiven Kunden ohne Rechnung diesen Monat je einen Entwurf. */
export function GenerateAllButton({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              'Für alle aktiven Kunden ohne Rechnung diesen Monat je einen Entwurf erstellen?',
            )
          ) {
            return;
          }
          start(async () => {
            const res = await generateAllDraftsAction(orgId);
            setMsg('message' in res ? (res.message ?? '') : '');
            if (res.status === 'success') router.refresh();
          });
        }}
      >
        {pending ? 'Erstelle …' : '⚙️ Alle offenen generieren'}
      </Button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </span>
  );
}

/** Häkchen „SEPA eingereicht" – rein manuell zum Abhaken. */
export function SepaSubmittedToggle({
  invoiceId,
  submittedAt,
}: {
  invoiceId: string;
  submittedAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const checked = !!submittedAt;

  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const submitted = e.target.checked;
          start(async () => {
            await toggleSepaSubmittedAction({ invoiceId, submitted });
            router.refresh();
          });
        }}
      />
      SEPA eingereicht
    </label>
  );
}
