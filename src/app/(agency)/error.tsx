'use client';

import { useEffect } from 'react';

/** Friendly error boundary for the agency area, so a single failing query
 *  doesn't drop the user onto the raw Next.js error screen. */
export default function AgencyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('agency.route.error', error.message, error.digest);
  }, [error]);

  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <div className="text-4xl">🛠️</div>
      <h1 className="text-xl font-bold">Da ist etwas schiefgelaufen</h1>
      <p className="text-sm text-muted-foreground">
        Diese Ansicht konnte nicht geladen werden. Bitte versuche es erneut –
        wenn es weiter hakt, lade die Seite neu.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Erneut versuchen
      </button>
    </div>
  );
}
