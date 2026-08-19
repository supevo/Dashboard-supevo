'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setOrgLogoAction } from '@/features/branding/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

const MAX_BYTES = 512 * 1024; // 512 KB Rohbild

function LogoSlot({
  variant,
  current,
  bg,
  hint,
}: {
  variant: 'dark' | 'light';
  current: string | null;
  bg: 'light' | 'dark';
  hint: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(dataUri: string) {
    setError(null);
    start(async () => {
      const res = await setOrgLogoAction({ variant, dataUri });
      if (res.status === 'error') setError('message' in res ? res.message ?? '' : '');
      else router.refresh();
    });
  }

  function onFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError('Bild ist zu groß (max. 512 KB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => save(String(reader.result));
    reader.onerror = () => setError('Datei konnte nicht gelesen werden.');
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">
        {variant === 'dark' ? 'Dunkles Logo' : 'Helles Logo'}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div
        className={`flex h-24 items-center justify-center rounded-lg border p-3 ${
          bg === 'light' ? 'bg-white' : 'bg-neutral-900'
        }`}
      >
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt="Logo-Vorschau" className="max-h-16 w-auto" />
        ) : (
          <span className={bg === 'light' ? 'text-neutral-400' : 'text-neutral-500'}>
            noch kein Logo
          </span>
        )}
      </div>
      {error && <Alert variant="destructive" className="text-xs">{error}</Alert>}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Lädt …' : current ? 'Ersetzen' : 'Hochladen'}
        </Button>
        {current && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => save('')}>
            Entfernen
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Org-Admin: zwei Logo-Varianten hochladen. Dunkles Logo für helle Hintergründe
 * (Rechnung/Vertrag, Light-UI), helles Logo für die Dark-UI.
 */
export function LogoSettings({
  logoDark,
  logoLight,
}: {
  logoDark: string | null;
  logoLight: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-6 sm:grid-cols-2">
        <LogoSlot
          variant="dark"
          current={logoDark}
          bg="light"
          hint="Für helle Hintergründe – wird auf Rechnungen, Verträgen und in der hellen Dashboard-Ansicht genutzt. Für Rechnungen bitte PNG/JPG (kein SVG)."
        />
        <LogoSlot
          variant="light"
          current={logoLight}
          bg="dark"
          hint="Für dunkle Hintergründe – wird in der dunklen Dashboard-Ansicht genutzt."
        />
      </div>
      <p className="text-xs text-muted-foreground">
        PNG, JPG oder SVG, max. 512 KB. Ohne hinterlegtes Logo wird das
        Standard-Logo verwendet.
      </p>
    </div>
  );
}
