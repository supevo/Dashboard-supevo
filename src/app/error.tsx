'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { de } from '@/lib/i18n/de';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side logging hook; server logs capture the full detail.
    console.error(error.digest ?? error.message);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Etwas ist schiefgelaufen</h1>
      <p className="text-muted-foreground">{de.errors.INTERNAL}</p>
      <Button onClick={reset}>Erneut versuchen</Button>
    </main>
  );
}
