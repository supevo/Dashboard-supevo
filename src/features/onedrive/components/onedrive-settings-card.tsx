'use client';

import { useActionState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  disconnectOneDriveAction,
  setOneDriveRootAction,
  setOneDrivePrimaryAction,
} from '@/features/onedrive/actions';
import { idleResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
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
  const [rootState, rootAction] = useActionState(setOneDriveRootAction, idleResult);
  const [primaryState, primaryAction] = useActionState(
    setOneDrivePrimaryAction,
    idleResult,
  );
  useEffect(() => {
    if (rootState.status === 'success' || primaryState.status === 'success') {
      router.refresh();
    }
  }, [rootState, primaryState, router]);

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
          <form action={rootAction} className="space-y-1 border-t pt-3">
            <label htmlFor="od-root" className="text-sm font-medium">
              Zugriff auf Basisordner begrenzen
            </label>
            <p className="text-xs text-muted-foreground">
              Pfad ab OneDrive-Wurzel, z. B. <code>ONE STEP/Kunden</code>. Das Team
              kann dann nur innerhalb dieses Ordners navigieren. Leer = ganzes
              OneDrive.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Input
                id="od-root"
                name="rootPath"
                defaultValue={status.rootPath ?? ''}
                placeholder="ONE STEP/Kunden"
                className="h-9 w-full max-w-xs"
              />
              <SubmitButton size="sm">Speichern</SubmitButton>
            </div>
            {rootState.status === 'error' && (
              <Alert variant="destructive" className="mt-1">
                {rootState.message}
              </Alert>
            )}
            {rootState.status === 'success' && (
              <Alert className="mt-1">{rootState.message}</Alert>
            )}
          </form>

          <form action={primaryAction} className="space-y-2 border-t pt-3">
            <label className="flex items-start gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="primary"
                defaultChecked={status.primaryAttachments}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                Aufgaben-Anhänge nur im OneDrive speichern
                <span className="block text-xs font-normal text-muted-foreground">
                  Spart Supabase-Speicher: Datei-Anhänge in Aufgaben landen dann
                  ausschließlich im OneDrive (Kundenordner bzw. Sammelordner).
                  Profilbilder, Titelbilder u. Ä. bleiben unberührt. Ist ein
                  Upload nicht möglich, wird ersatzweise regulär gespeichert.
                </span>
              </span>
            </label>
            <div className="space-y-1">
              <label htmlFor="od-collection" className="text-xs text-muted-foreground">
                Sammelordner für Anhänge ohne Kundenzuordnung (leer = automatisch
                unter dem Basisordner „…/_Anhänge“)
              </label>
              <Input
                id="od-collection"
                name="collectionPath"
                defaultValue={status.collectionFolderPath ?? ''}
                placeholder="ONE STEP/Kunden/_Anhänge"
                className="h-9 w-full max-w-md"
              />
            </div>
            <SubmitButton size="sm">Speichern</SubmitButton>
            {primaryState.status === 'error' && (
              <Alert variant="destructive" className="mt-1">
                {primaryState.message}
              </Alert>
            )}
            {primaryState.status === 'success' && (
              <Alert className="mt-1">{primaryState.message}</Alert>
            )}
          </form>

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
