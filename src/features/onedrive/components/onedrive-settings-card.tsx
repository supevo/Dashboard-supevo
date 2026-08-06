'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { disconnectOneDriveAction } from '@/features/onedrive/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import type { OneDriveStatus } from '@/features/onedrive/queries';

/**
 * Settings card to connect/disconnect the org's (personal) OneDrive. The connect
 * button starts the OAuth flow; disconnect removes the stored refresh token.
 */
export function OneDriveSettingsCard({
  status,
  justConnected,
  hadError,
}: {
  status: OneDriveStatus;
  justConnected: boolean;
  hadError: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (!status.configured) {
    return (
      <p className="text-sm text-muted-foreground">
        OneDrive ist für diese Installation noch nicht eingerichtet. Bitte
        MS_CLIENT_ID, MS_CLIENT_SECRET (und ggf. MS_REDIRECT_URI) in den
        Server-Umgebungsvariablen hinterlegen.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {justConnected && <Alert>OneDrive wurde verbunden.</Alert>}
      {hadError && (
        <Alert variant="destructive">
          Verbindung fehlgeschlagen. Bitte erneut versuchen.
        </Alert>
      )}
      {!status.vaultReady && (
        <Alert variant="destructive">
          Es fehlt der Verschlüsselungs-Schlüssel (SECRET_ENCRYPTION_KEY). Ohne
          ihn kann das Zugriffs-Token nicht sicher gespeichert werden.
        </Alert>
      )}

      {status.connected ? (
        <>
          <p className="text-sm">
            Verbunden{status.accountLabel ? ` als ${status.accountLabel}` : ''}. Die
            Kundenordner können in Aufgaben durchsucht werden, und hochgeladene
            Aufgaben-Dateien werden in den verknüpften Kundenordner gespiegelt.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await disconnectOneDriveAction();
                router.refresh();
              })
            }
          >
            {pending ? 'Trennt …' : 'OneDrive trennen'}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Verbinde dein persönliches OneDrive, damit das Team über die App auf
            die Kundenordner zugreifen kann. Es wird nur ein verschlüsseltes
            Zugriffs-Token gespeichert – kein Passwort.
          </p>
          <a
            href="/api/integrations/onedrive/connect"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Mit OneDrive verbinden
          </a>
        </>
      )}
    </div>
  );
}
