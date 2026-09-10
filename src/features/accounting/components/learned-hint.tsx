'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setBelegNichtNoetigAction } from '@/features/accounting/month-close-actions';
import { setTransactionCategoryAction } from '@/features/accounting/category-actions';

/**
 * Zeigt, was das System früher für denselben Empfänger entschieden hat, als
 * Ein-Klick-Vorschlag (nicht automatisch übernommen): eine gelernte Kategorie
 * und/oder ein gelernter „kein Beleg nötig"-Grund.
 */
export function LearnedHint({
  txId,
  learnedReason,
  learnedKategorieId,
  learnedKategorieLabel,
}: {
  txId: string;
  learnedReason: string | null;
  learnedKategorieId: string | null;
  learnedKategorieLabel: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();

  if (!learnedReason && !learnedKategorieId) return null;

  function applyReason() {
    if (!learnedReason) return;
    start(async () => {
      const res = await setBelegNichtNoetigAction({
        transactionId: txId,
        value: true,
        reason: learnedReason!,
      });
      if (res.status === 'success') router.refresh();
    });
  }

  function applyCategory() {
    if (!learnedKategorieId) return;
    start(async () => {
      const res = await setTransactionCategoryAction({
        transactionId: txId,
        kategorieId: learnedKategorieId!,
      });
      if (res.status === 'success') router.refresh();
    });
  }

  return (
    <div className="mt-1 rounded-md border border-sky-500/40 bg-sky-500/[0.06] px-2.5 py-1.5 text-xs">
      <div className="font-medium text-sky-700 dark:text-sky-300">
        🧠 Wie du diesen Empfänger früher gebucht hast:
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {learnedKategorieId && (
          <button
            type="button"
            disabled={busy}
            onClick={applyCategory}
            className="underline-offset-2 hover:underline disabled:opacity-50"
          >
            Kategorie &bdquo;{learnedKategorieLabel}&ldquo; übernehmen
          </button>
        )}
        {learnedReason && (
          <button
            type="button"
            disabled={busy}
            onClick={applyReason}
            className="underline-offset-2 hover:underline disabled:opacity-50"
          >
            &bdquo;kein Beleg nötig&ldquo; übernehmen ({learnedReason})
          </button>
        )}
      </div>
    </div>
  );
}
