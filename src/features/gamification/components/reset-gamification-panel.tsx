'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resetGamificationAction } from '@/features/gamification/reset-actions';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';

const CONFIRM_WORD = 'ZURÜCKSETZEN';

/**
 * Super-Admin-Werkzeug: XP, Ränge und Coins zurücksetzen (alle oder eine Person).
 * Badges, Titelbilder/Rahmen und Inventar bleiben erhalten. Absichtlich mit
 * Tippen-zum-Bestätigen abgesichert.
 */
export function ResetGamificationPanel({
  orgId,
  colleagues,
}: {
  orgId: string;
  colleagues: { userId: string; name: string }[];
}) {
  const [scope, setScope] = useState<'all' | string>('all');
  const [includeKudos, setIncludeKudos] = useState(true);
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const canSubmit = confirm.trim() === CONFIRM_WORD && !pending;

  function submit() {
    setMsg(null);
    start(async () => {
      const res = await resetGamificationAction({ orgId, scope, includeKudos, confirm });
      if (res.status === 'error') {
        setMsg({ ok: false, text: res.message });
      } else {
        setMsg({ ok: true, text: res.status === 'success' ? (res.message ?? 'Zurückgesetzt.') : 'Zurückgesetzt.' });
        setConfirm('');
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <p className="font-medium">Was passiert:</p>
        <ul className="mt-1 list-inside list-disc text-muted-foreground">
          <li>XP & Ränge werden auf 0 gesetzt (Level startet neu).</li>
          <li>Coin-Guthaben wird auf 0 gesetzt.</li>
        </ul>
        <p className="mt-2 font-medium">Bleibt erhalten:</p>
        <ul className="mt-1 list-inside list-disc text-muted-foreground">
          <li>Badges / Auszeichnungen</li>
          <li>Titelbilder, Rahmen &amp; gewonnenes Inventar</li>
        </ul>
      </div>

      {msg && <Alert variant={msg.ok ? 'success' : 'destructive'}>{msg.text}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Umfang</Label>
          <Select value={scope} onChange={(e) => setScope(e.target.value)} className="h-9">
            <option value="all">Alle Mitarbeiter</option>
            {colleagues.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-start gap-2 rounded-md border p-2 text-sm">
          <input
            type="checkbox"
            checked={includeKudos}
            onChange={(e) => setIncludeKudos(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="font-medium">Kollegen-Kudos mit zurücksetzen</span>
            <span className="block text-xs text-muted-foreground">
              Nötig für einen echten Rang-Reset (Kudos-Punkte zählen zu XP &amp;
              Coins). Ausschalten = nur automatische XP &amp; Coins zurücksetzen,
              erhaltene Kudos bleiben.
            </span>
          </span>
        </label>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">
          Zur Bestätigung „{CONFIRM_WORD}“ eintippen
        </Label>
        <Input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={CONFIRM_WORD}
          className="h-9 max-w-xs"
        />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
      >
        {pending ? 'Wird zurückgesetzt …' : 'Jetzt zurücksetzen'}
      </button>
    </div>
  );
}
