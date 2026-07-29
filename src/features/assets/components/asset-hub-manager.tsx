'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addAssetLinkAction,
  deleteAssetAction,
} from '@/features/assets/actions';
import type { AssetView } from '@/features/assets/queries';
import { validateUpload } from '@/lib/files/validation';
import { idleResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CATEGORY_LABEL: Record<AssetView['category'], string> = {
  guideline: '📘 Marken-Guidelines',
  logo: '🎨 Finale Logos',
  access: '🔑 Zugänge',
};

/**
 * Agency-side management of a client's Asset-Hub: upload logos/guideline files,
 * add guideline links and access references (login URL + username + link to the
 * password manager — no passwords are stored), and delete entries.
 */
export function AssetHubManager({
  orgId,
  clientCompanyId,
  assets,
}: {
  orgId: string;
  clientCompanyId: string;
  assets: AssetView[];
}) {
  const router = useRouter();

  const grouped = {
    guideline: assets.filter((a) => a.category === 'guideline'),
    logo: assets.filter((a) => a.category === 'logo'),
    access: assets.filter((a) => a.category === 'access'),
  };

  return (
    <div className="space-y-6">
      <AssetUploader
        clientCompanyId={clientCompanyId}
        onDone={() => router.refresh()}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <AddLinkForm orgId={orgId} clientCompanyId={clientCompanyId} />
        <AddAccessForm orgId={orgId} clientCompanyId={clientCompanyId} />
      </div>

      <div className="space-y-4">
        {(['logo', 'guideline', 'access'] as const).map((cat) => (
          <div key={cat}>
            <h3 className="mb-2 text-sm font-semibold">{CATEGORY_LABEL[cat]}</h3>
            {grouped[cat].length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch nichts hinterlegt.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {grouped[cat].map((a) => (
                  <AssetRow key={a.id} asset={a} clientCompanyId={clientCompanyId} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AssetUploader({
  clientCompanyId,
  onDone,
}: {
  clientCompanyId: string;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const guideRef = useRef<HTMLInputElement>(null);

  async function upload(file: File, category: 'logo' | 'guideline') {
    setError(null);
    if (validateUpload({ size: file.size, type: file.type })) {
      setError('Dieser Dateityp oder die Größe ist nicht erlaubt (max. 25 MB).');
      return;
    }
    setPending(true);
    try {
      const createRes = await fetch('/api/assets/create-upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientCompanyId,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      const created = (await createRes.json()) as {
        path?: string;
        token?: string;
        storagePath?: string;
        error?: string;
      };
      if (!createRes.ok || !created.token || !created.path || !created.storagePath) {
        setError(created.error ?? 'Upload fehlgeschlagen.');
        return;
      }

      const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage
        .from('files')
        .uploadToSignedUrl(created.path, created.token, file, {
          contentType: file.type,
        });
      if (upErr) {
        setError('Upload fehlgeschlagen.');
        return;
      }

      const finRes = await fetch('/api/assets/finalize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientCompanyId,
          category,
          storagePath: created.storagePath,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      if (!finRes.ok) {
        const fin = (await finRes.json()) as { error?: string };
        setError(fin.error ?? 'Upload fehlgeschlagen.');
        return;
      }
      onDone();
    } finally {
      setPending(false);
      if (logoRef.current) logoRef.current.value = '';
      if (guideRef.current) guideRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="text-sm font-semibold">Datei hochladen</div>
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <input
          ref={logoRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f, 'logo');
          }}
        />
        <input
          ref={guideRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f, 'guideline');
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => logoRef.current?.click()}
        >
          🎨 Logo hochladen
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => guideRef.current?.click()}
        >
          📘 Guideline hochladen
        </Button>
        {pending && <span className="text-sm text-muted-foreground">Wird hochgeladen …</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        Bilder, PDF u. a. bis 25 MB. Logos &amp; Guidelines sieht auch der Kunde.
      </p>
    </div>
  );
}

function AddLinkForm({
  orgId,
  clientCompanyId,
}: {
  orgId: string;
  clientCompanyId: string;
}) {
  const [state, action] = useActionState(addAssetLinkAction, idleResult);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-2 rounded-lg border p-3"
    >
      <div className="text-sm font-semibold">Guideline-Link hinzufügen</div>
      {state.status === 'success' && state.message && (
        <Alert variant="success">{state.message}</Alert>
      )}
      {state.status === 'error' && <Alert variant="destructive">{state.message}</Alert>}
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      <input type="hidden" name="category" value="guideline" />
      <Input name="title" placeholder="Titel (z. B. Brand-Guide 2026)" required />
      <Input name="url" type="url" placeholder="https://…" required />
      <SubmitButton size="sm">Hinzufügen</SubmitButton>
    </form>
  );
}

function AddAccessForm({
  orgId,
  clientCompanyId,
}: {
  orgId: string;
  clientCompanyId: string;
}) {
  const [state, action] = useActionState(addAssetLinkAction, idleResult);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-2 rounded-lg border p-3"
    >
      <div className="text-sm font-semibold">🔑 Zugang hinterlegen (nur Team)</div>
      {state.status === 'success' && state.message && (
        <Alert variant="success">{state.message}</Alert>
      )}
      {state.status === 'error' && <Alert variant="destructive">{state.message}</Alert>}
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      <input type="hidden" name="category" value="access" />
      <Input name="title" placeholder="Dienst (z. B. Instagram, WordPress)" required />
      <Input name="url" type="url" placeholder="Login-URL https://…" />
      <Input name="username" placeholder="Benutzername / Login" />
      <Textarea
        name="notes"
        rows={2}
        placeholder="Hinweis / Link zum Passwort-Manager (kein Passwort hier eintragen)"
      />
      <p className="text-xs text-muted-foreground">
        Aus Sicherheitsgründen werden hier keine Passwörter gespeichert – nur
        Verweise und der Link zu eurem Passwort-Manager.
      </p>
      <SubmitButton size="sm">Speichern</SubmitButton>
    </form>
  );
}

function AssetRow({
  asset,
  clientCompanyId,
}: {
  asset: AssetView;
  clientCompanyId: string;
}) {
  const [state, formAction] = useActionState(deleteAssetAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <li className="flex items-center justify-between gap-2 p-2 text-sm">
      <div className="min-w-0">
        <div className="truncate font-medium">{asset.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {asset.username && <span>👤 {asset.username} · </span>}
          {asset.hasFile && <span>{formatSize(asset.sizeBytes)} · </span>}
          {asset.url && (
            <a
              href={asset.url}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Link öffnen
            </a>
          )}
          {asset.hasFile && (
            <a
              href={`/api/assets/${asset.id}/download`}
              className="text-primary hover:underline"
            >
              Herunterladen
            </a>
          )}
        </div>
        {asset.notes && (
          <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
            {asset.notes}
          </p>
        )}
      </div>
      <form action={formAction} className="shrink-0">
        <input type="hidden" name="assetId" value={asset.id} />
        <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
        <SubmitButton variant="ghost" size="sm">
          Löschen
        </SubmitButton>
      </form>
    </li>
  );
}
