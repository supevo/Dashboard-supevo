'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { purgeMemberAction } from '@/features/admin/purge-actions';

/**
 * Super-Admin-only: entfernt einen Mitarbeiter aus der Organisation und setzt
 * seine Arbeitszeit-/Testdaten zurück. Master-Passwort erforderlich.
 */
export function PurgeMemberButton({
  userId,
  orgId,
  memberName,
}: {
  userId: string;
  orgId: string;
  memberName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const res = await purgeMemberAction({ userId, orgId, password });
      if (res.status !== 'success') {
        setError('message' in res ? res.message : 'Fehlgeschlagen.');
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
      >
        Entfernen
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Mitarbeiter entfernen">
        <div className="space-y-3">
          <Alert variant="destructive" className="text-sm">
            Entfernt <strong>{memberName}</strong> aus der Organisation und löscht
            dessen Arbeitszeit-/Zeiterfassungsdaten. Der Login-Account bleibt
            bestehen (Neu-Einladung möglich).
          </Alert>
          <div className="space-y-1">
            <Label htmlFor="pm-pw">Master-Passwort</Label>
            <Input
              id="pm-pw"
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
              disabled={pending || !password}
            >
              {pending ? 'Entferne …' : 'Entfernen'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
