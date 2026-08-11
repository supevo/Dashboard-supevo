'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setAbgleichAusschlussAction } from '@/features/accounting/actions';
import { KATEGORIEN_BY_ART } from '@/features/accounting/categories';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/**
 * Lets the user pick which Kontoauszug categories are EXCLUDED from the
 * Abgleich (e.g. Privatentnahme, USt-Zahlung, Umbuchung, Löhne). Excluded
 * bookings don't get matched, don't show as "Beleg fehlt", and are grouped
 * separately in the CSV export with a note for the Steuerberater.
 */
export function AbgleichAusschlussEditor({
  billingEntityId,
  initial,
}: {
  billingEntityId: string;
  initial: string[];
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set(initial));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle(id: string) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await setAbgleichAusschlussAction({
      billingEntityId,
      categoryIds: [...sel],
    });
    setBusy(false);
    setMsg({
      ok: res.status === 'success',
      text: 'message' in res ? (res.message ?? '') : '',
    });
    if (res.status === 'success') router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Angehakte Kategorien fließen NICHT in den Abgleich ein (z. B.
        Privatentnahmen, Steuerzahlungen, Umbuchungen, Löhne). Sie erscheinen
        nicht als „Beleg fehlt“ und werden im CSV-Export separat mit dem Hinweis
        „liegt dem Steuerberater vor“ gruppiert.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {KATEGORIEN_BY_ART.map((group) => (
          <div key={group.art} className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground">
              {group.label}
            </div>
            {group.items.map((k) => (
              <label
                key={k.id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={sel.has(k.id)}
                  onChange={() => toggle(k.id)}
                  disabled={busy}
                  className="h-4 w-4"
                />
                {k.label}
              </label>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" onClick={save} disabled={busy}>
          {busy ? 'Speichern …' : 'Speichern'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {sel.size} ausgeklammert
        </span>
        {msg && (
          <Alert variant={msg.ok ? 'default' : 'destructive'} className="py-1 text-xs">
            {msg.text}
          </Alert>
        )}
      </div>
    </div>
  );
}
