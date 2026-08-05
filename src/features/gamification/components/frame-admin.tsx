'use client';

import { DropZone } from '@/components/ui/drop-zone';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteHubFrameAction } from '@/features/gamification/actions';
import type { HubFrameAdminItem } from '@/features/gamification/frame-queries';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/**
 * Admin-Steuerung zum Hochladen von Profilrahmen (ersetzen im Level Hub den
 * XP-Ring). Jeder Rahmen ist ab einem Level wählbar oder „exklusiv" (nur über
 * Lootboxen – Sonderrahmen). Empfohlen: quadratisches PNG/SVG mit transparenter
 * Mitte, 512×512 px.
 */
export function FrameAdmin({ frames }: { frames: HubFrameAdminItem[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [level, setLevel] = useState(0);
  const [exclusive, setExclusive] = useState(false);
  const [coinPrice, setCoinPrice] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, startDelete] = useTransition();

  async function upload() {
    if (!file) {
      setError('Bitte eine Datei wählen.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const createRes = await fetch('/api/hub-frames/create-upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
      });
      const created = (await createRes.json()) as {
        path?: string;
        token?: string;
        storagePath?: string;
        frameId?: string;
        error?: string;
      };
      if (
        !createRes.ok ||
        !created.path ||
        !created.token ||
        !created.storagePath ||
        !created.frameId
      ) {
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

      const finRes = await fetch('/api/hub-frames/finalize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          frameId: created.frameId,
          storagePath: created.storagePath,
          name: name || 'Profilrahmen',
          level,
          exclusive,
          coinPrice,
        }),
      });
      const finJson = (await finRes.json()) as { ok?: boolean; error?: string };
      if (!finRes.ok || !finJson.ok) {
        setError(finJson.error ?? 'Upload fehlgeschlagen.');
        return;
      }

      setName('');
      setLevel(0);
      setExclusive(false);
      setCoinPrice(0);
      setFile(null);
      router.refresh();
    } catch {
      setError('Upload fehlgeschlagen.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Profilrahmen ersetzen im Level Hub den XP-Ring. Empfohlen: quadratisches
        PNG oder SVG mit transparenter Mitte, 512×512 px (max. 5 MB). Ab dem
        Freischalt-Level wählbar – oder „exklusiv&ldquo; nur über Lootboxen.
      </p>

      {frames.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {frames.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-lg border p-2">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.imageUrl}
                  alt=""
                  aria-hidden
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{f.name}</div>
                <div className="text-xs text-muted-foreground">
                  {f.exclusive
                    ? '🎁 nur über Lootbox'
                    : `ab Level ${f.unlockLevel}${f.coinPrice > 0 ? ` · 🪙 ${f.coinPrice}` : ''}`}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deleting}
                aria-label="Löschen"
                onClick={() =>
                  startDelete(async () => {
                    await deleteHubFrameAction(f.id);
                    router.refresh();
                  })
                }
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Noch keine Rahmen hochgeladen.</p>
      )}

      <div className="space-y-3 rounded-lg border p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Rahmen hinzufügen
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Goldener Rahmen"
              maxLength={80}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Ab Level</label>
            <Input
              type="number"
              min={0}
              max={999}
              value={level}
              onChange={(e) => setLevel(Math.max(0, Number(e.target.value) || 0))}
              disabled={exclusive}
              className="w-24"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Coin-Preis (0 = nicht kaufbar)</label>
            <Input
              type="number"
              min={0}
              max={100000}
              value={coinPrice}
              onChange={(e) => setCoinPrice(Math.max(0, Number(e.target.value) || 0))}
              disabled={exclusive}
              className="w-28"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={exclusive}
            onChange={(e) => setExclusive(e.target.checked)}
          />
          <span>🎁 Exklusiv – nur über Lootbox erhältlich (Sonderrahmen)</span>
        </label>
        <DropZone overlayLabel="Bild hier ablegen">
          <input
            type="file"
            accept="image/png,image/webp,image/svg+xml,image/gif"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm"
          />
        </DropZone>
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button type="button" size="sm" onClick={upload} disabled={uploading}>
          {uploading ? 'Lädt…' : 'Hochladen'}
        </Button>
      </div>
    </div>
  );
}
