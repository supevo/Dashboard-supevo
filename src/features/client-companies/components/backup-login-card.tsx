'use client';

import { useState, useTransition } from 'react';
import { createBackupLoginAction } from '@/features/client-companies/backup-login-actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/**
 * Super-Admin: erzeugt/rotiert einen Backup-Portalzugang für diesen Kunden und
 * zeigt die Zugangsdaten EINMALIG. Damit kann man sich als echter Kunde einloggen
 * (Ansichten vergleichen, Bugs testen) – alle Rechte greifen wie beim Kunden.
 */
export function BackupLoginCard({ clientCompanyId }: { clientCompanyId: string }) {
  const [busy, start] = useTransition();
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    setCreds(null);
    start(async () => {
      const res = await createBackupLoginAction(clientCompanyId);
      if (res.status === 'success') {
        setCreds((res.data as { email: string; password: string }) ?? null);
      } else {
        setError('message' in res ? (res.message ?? 'Fehler') : 'Fehler');
      }
    });
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Erzeugt einen dedizierten Portal-Login für diesen Kunden. Damit kannst du
        dich als Kunde einloggen, um Ansichten zu vergleichen und Fehler zu testen.
        Der Zugang hat exakt die Rechte dieses Kunden. Das Passwort wird nur{' '}
        <strong>einmalig</strong> angezeigt – erneutes Erstellen setzt ein neues.
      </p>

      {error && <Alert variant="destructive">{error}</Alert>}

      {creds && (
        <div className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Zugangsdaten (jetzt kopieren – werden nicht erneut gezeigt)
          </div>
          <div className="grid gap-1 font-mono text-sm">
            <div>
              <span className="text-muted-foreground">E-Mail: </span>
              <span className="select-all">{creds.email}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Passwort: </span>
              <span className="select-all">{creds.password}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Zum Testen abmelden und unter <strong>/login</strong> mit diesen Daten
            als Kunde anmelden.
          </p>
        </div>
      )}

      <Button type="button" onClick={run} disabled={busy} size="sm" variant="outline">
        {busy
          ? 'Erstelle …'
          : creds
            ? 'Neues Passwort erzeugen'
            : 'Backup-Zugang erstellen'}
      </Button>
    </div>
  );
}
