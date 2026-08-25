'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { generateOfferDeliveryAction } from '@/features/memberships/generate-actions';

/**
 * Agentur-Knopf: erzeugt aus dem gespeicherten Angebot des Kunden die
 * Marketingplan-Maßnahmen und Aufgaben (Warteschlange + wiederkehrend). Nur mit
 * supevo-Basis. Zeigt das Ergebnis (oder die Fehlermeldung) direkt an.
 */
export function GenerateOfferButton({
  clientCompanyId,
}: {
  clientCompanyId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function run() {
    if (
      !window.confirm(
        'Aus dem gespeicherten Angebot Marketingplan-Maßnahmen und Aufgaben erzeugen?',
      )
    ) {
      return;
    }
    setMsg(null);
    start(async () => {
      const res = await generateOfferDeliveryAction(clientCompanyId);
      if (res.status === 'success') {
        setMsg({ ok: true, text: res.message ?? 'Erledigt.' });
        router.refresh();
      } else {
        setMsg({ ok: false, text: 'message' in res ? res.message : 'Fehlgeschlagen.' });
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={run} disabled={pending}>
        {pending ? 'Wird erzeugt…' : '✨ Aus Angebot erzeugen'}
      </Button>
      <p className="text-xs text-muted-foreground">
        Legt – nur mit gewählter supevo-Basis – Marketingplan-Maßnahmen und
        Aufgaben (Warteschlange &amp; Daueraufgaben) gemäß den Modul-Einstellungen
        an. Bereits vorhandene werden übersprungen.
      </p>
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
