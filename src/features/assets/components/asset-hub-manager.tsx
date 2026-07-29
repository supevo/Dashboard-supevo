'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addAssetLinkAction,
  deleteAssetAction,
  createBrandAction,
  deleteBrandAction,
  revealAssetSecretAction,
} from '@/features/assets/actions';
import type { AssetView, Brand } from '@/features/assets/queries';
import { validateUpload } from '@/lib/files/validation';
import { idleResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CATEGORY_LABEL: Record<AssetView['category'], string> = {
  logo: '🎨 Finale Logos',
  guideline: '📘 Marken-Guidelines',
  access: '🔑 Zugänge',
};

/**
 * Marken-Hub management, shared by the agency (canManageAccess) and the client
 * (portal). Supports multiple (sub-)brands: uploads and links are filed under a
 * chosen brand (or „Allgemein"). Access references are agency-only.
 */
export function AssetHubManager({
  clientCompanyId,
  brands,
  assets,
  canReveal,
  secretVaultEnabled,
}: {
  clientCompanyId: string;
  brands: Brand[];
  assets: AssetView[];
  /** Agency staff: may reveal (decrypt) stored access passwords. */
  canReveal: boolean;
  /** True when SECRET_ENCRYPTION_KEY is configured (password field available). */
  secretVaultEnabled: boolean;
}) {
  const router = useRouter();
  const [targetBrand, setTargetBrand] = useState('');

  // Sections to render: „Allgemein" (null) + every brand.
  const sections: { id: string | null; name: string }[] = [
    { id: null, name: 'Allgemein' },
    ...brands.map((b) => ({ id: b.id, name: b.name })),
  ];
  const categories: AssetView['category'][] = ['logo', 'guideline', 'access'];

  return (
    <div className="space-y-6">
      <CreateBrandForm
        clientCompanyId={clientCompanyId}
        onDone={() => router.refresh()}
      />

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Neuer Eintrag für:</span>
          <Select
            value={targetBrand}
            onChange={(e) => setTargetBrand(e.target.value)}
            className="w-48"
          >
            <option value="">Allgemein</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>

        <AssetUploader
          clientCompanyId={clientCompanyId}
          brandId={targetBrand}
          onDone={() => router.refresh()}
        />

        <div className="grid gap-3 md:grid-cols-2">
          <AddLinkForm clientCompanyId={clientCompanyId} brandId={targetBrand} />
          <AddAccessForm
            clientCompanyId={clientCompanyId}
            brandId={targetBrand}
            teamOnly={canReveal}
            secretVaultEnabled={secretVaultEnabled}
          />
        </div>
      </div>

      <div className="space-y-5">
        {sections.map((section) => {
          const inSection = assets.filter((a) => a.brandId === section.id);
          return (
            <div key={section.id ?? 'general'} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="font-semibold">
                  {section.id === null ? '📁 ' : '🏷️ '}
                  {section.name}
                </h3>
                {section.id !== null && (
                  <DeleteBrandButton
                    clientCompanyId={clientCompanyId}
                    brandId={section.id}
                  />
                )}
              </div>
              {inSection.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Noch nichts hinterlegt.
                </p>
              ) : (
                <div className="space-y-3">
                  {categories.map((cat) => {
                    const items = inSection.filter((a) => a.category === cat);
                    if (items.length === 0) return null;
                    return (
                      <div key={cat}>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {CATEGORY_LABEL[cat]}
                        </div>
                        <ul className="divide-y rounded-md border">
                          {items.map((a) => (
                            <AssetRow
                              key={a.id}
                              asset={a}
                              clientCompanyId={clientCompanyId}
                              canReveal={canReveal}
                            />
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CreateBrandForm({
  clientCompanyId,
  onDone,
}: {
  clientCompanyId: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState(createBrandAction, idleResult);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      onDone();
    }
  }, [state, onDone]);

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-2">
      <div className="flex-1">
        <label className="mb-1 block text-sm font-semibold">Neue Marke / Submarke</label>
        <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
        <Input name="name" placeholder="Markenname (z. B. Produktlinie XY)" required />
      </div>
      <SubmitButton size="sm">Marke anlegen</SubmitButton>
      {state.status === 'error' && (
        <Alert variant="destructive" className="w-full">
          {state.message}
        </Alert>
      )}
    </form>
  );
}

function AssetUploader({
  clientCompanyId,
  brandId,
  onDone,
}: {
  clientCompanyId: string;
  brandId: string;
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
          brandId: brandId || null,
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
    <div className="space-y-2">
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
      <p className="text-xs text-muted-foreground">Bilder, PDF u. a. bis 25 MB.</p>
    </div>
  );
}

function AddLinkForm({
  clientCompanyId,
  brandId,
}: {
  clientCompanyId: string;
  brandId: string;
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
    <form ref={formRef} action={action} className="space-y-2 rounded-lg border p-3">
      <div className="text-sm font-semibold">Guideline-Link hinzufügen</div>
      {state.status === 'success' && state.message && (
        <Alert variant="success">{state.message}</Alert>
      )}
      {state.status === 'error' && <Alert variant="destructive">{state.message}</Alert>}
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="category" value="guideline" />
      <Input name="title" placeholder="Titel (z. B. Brand-Guide 2026)" required />
      <Input name="url" type="url" placeholder="https://…" required />
      <SubmitButton size="sm">Hinzufügen</SubmitButton>
    </form>
  );
}

function AddAccessForm({
  clientCompanyId,
  brandId,
  teamOnly,
  secretVaultEnabled,
}: {
  clientCompanyId: string;
  brandId: string;
  /** True for the agency view (entry stays team-internal). */
  teamOnly: boolean;
  secretVaultEnabled: boolean;
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
    <form ref={formRef} action={action} className="space-y-2 rounded-lg border p-3">
      <div className="text-sm font-semibold">
        🔑 {teamOnly ? 'Zugang hinterlegen (nur Team)' : 'Login / Zugang hinterlegen'}
      </div>
      {state.status === 'success' && state.message && (
        <Alert variant="success">{state.message}</Alert>
      )}
      {state.status === 'error' && <Alert variant="destructive">{state.message}</Alert>}
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="category" value="access" />
      <Input name="title" placeholder="Dienst (z. B. Instagram, WordPress)" required />
      <Input name="url" type="url" placeholder="Login-URL https://…" />
      <Input name="username" placeholder="Benutzername / Login" />
      {secretVaultEnabled && (
        <>
          <Input
            name="secret"
            type="password"
            autoComplete="new-password"
            placeholder="Passwort (verschlüsselt gespeichert)"
          />
          <p className="text-xs text-muted-foreground">
            🔒 Passwort wird verschlüsselt gespeichert (AES-256). Nur das
            Agentur-Team kann es später anzeigen.
          </p>
        </>
      )}
      <Textarea
        name="notes"
        rows={2}
        placeholder={
          secretVaultEnabled
            ? 'Notiz (optional)'
            : 'Hinweis / Link zum Passwort-Manager (kein Passwort hier eintragen)'
        }
      />
      <SubmitButton size="sm">Speichern</SubmitButton>
    </form>
  );
}

function DeleteBrandButton({
  clientCompanyId,
  brandId,
}: {
  clientCompanyId: string;
  brandId: string;
}) {
  const [state, formAction] = useActionState(deleteBrandAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      <input type="hidden" name="brandId" value={brandId} />
      <SubmitButton variant="ghost" size="sm">
        Marke löschen
      </SubmitButton>
    </form>
  );
}

function AssetRow({
  asset,
  clientCompanyId,
  canReveal,
}: {
  asset: AssetView;
  clientCompanyId: string;
  canReveal: boolean;
}) {
  const [state, formAction] = useActionState(deleteAssetAction, idleResult);
  const router = useRouter();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  async function reveal() {
    setRevealing(true);
    setRevealError(null);
    try {
      const res = await revealAssetSecretAction(asset.id);
      if (res.ok && res.secret !== undefined) setRevealed(res.secret);
      else setRevealError(res.error ?? 'Konnte nicht anzeigen.');
    } finally {
      setRevealing(false);
    }
  }

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
        {asset.hasSecret && (
          <div className="mt-0.5 text-xs">
            {revealed !== null ? (
              <span className="font-mono text-foreground">🔓 {revealed}</span>
            ) : canReveal ? (
              <button
                type="button"
                disabled={revealing}
                onClick={() => void reveal()}
                className="text-primary hover:underline"
              >
                🔒 Passwort anzeigen
              </button>
            ) : (
              <span className="text-muted-foreground">🔒 Passwort hinterlegt</span>
            )}
            {revealError && <span className="ml-2 text-destructive">{revealError}</span>}
          </div>
        )}
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
