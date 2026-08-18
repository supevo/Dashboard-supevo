'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { purgeClientAction } from '@/features/admin/purge-actions';

/**
 * Super-Admin-only: löscht einen Kunden endgültig. Doppelte Absicherung –
 * exakter Kundenname zum Bestätigen + Master-Passwort.
 */
export function PurgeClientButton({
  clientCompanyId,
  clientName,
}: {
  clientCompanyId: string;
  clientName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const nameOk = confirmName.trim() === clientName.trim();

  function submit() {
    setError(null);
    start(async () => {
      const res = await purgeClientAction({ clientCompanyId, password });
      if (res.status !== 'success') {
        setError('message' in res ? res.message : 'Fehlgeschlagen.');
        return;
      }
      setOpen(false);
      router.push('/app/clients');
    });
  }

  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
        Kunde endgültig löschen
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Kunde endgültig löschen">
        <div className="space-y-3">
          <Alert variant="destructive" className="text-sm">
            Löscht <strong>{clientName}</strong> unwiderruflich – inklusive
            Projekte, Aufgaben, Rechnungen und Zeiten. Das kann nicht rückgängig
            gemacht werden.
          </Alert>
          <div className="space-y-1">
            <Label htmlFor="pc-name">
              Zum Bestätigen den Kundennamen eingeben: <strong>{clientName}</strong>
            </Label>
            <Input
              id="pc-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pc-pw">Master-Passwort</Label>
            <Input
              id="pc-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
          </div>
          {error && <Alert variant="destructive" className="text-xs">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              Abbrechen
            </button>
            <Button
              type="button"
              variant="destructive"
              onClick={submit}
              disabled={pending || !nameOk || !password}
            >
              {pending ? 'Lösche …' : 'Endgültig löschen'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
