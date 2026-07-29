'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteHubBannerAction } from '@/features/gamification/actions';
import type { HubBannerAdminItem } from '@/features/gamification/banner-queries';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { de } from '@/lib/i18n/de';

/**
 * Admin control to upload Level-Hub banner images and assign each an unlock
 * level. Uploaded banners appear in every employee's hub and adapt to their
 * level automatically (highest unlocked one), or can be picked manually.
 */
export function BannerAdmin({ banners }: { banners: HubBannerAdminItem[] }) {
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
      setError(de.hubBanners.pickFile);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      // Step 1: signed upload target (bypasses the serverless body-size limit).
      const createRes = await fetch('/api/hub-banners/create-upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
      });
      const created = (await createRes.json()) as {
        path?: string;
        token?: string;
        storagePath?: string;
        bannerId?: string;
        error?: string;
      };
      if (
        !createRes.ok ||
        !created.path ||
        !created.token ||
        !created.storagePath ||
        !created.bannerId
      ) {
        setError(created.error ?? de.task.uploadError);
        return;
      }

      // Step 2: upload the bytes DIRECTLY to storage.
      const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage
        .from('files')
        .uploadToSignedUrl(created.path, created.token, file, {
          contentType: file.type,
        });
      if (upErr) {
        setError(de.task.uploadError);
        return;
      }

      // Step 3: record the banner row.
      const finRes = await fetch('/api/hub-banners/finalize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bannerId: created.bannerId,
          storagePath: created.storagePath,
          name: name || de.hubBanners.defaultName,
          level,
          exclusive,
          coinPrice,
        }),
      });
      const finJson = (await finRes.json()) as { ok?: boolean; error?: string };
      if (!finRes.ok || !finJson.ok) {
        setError(finJson.error ?? de.task.uploadError);
        return;
      }

      setName('');
      setLevel(0);
      setExclusive(false);
      setCoinPrice(0);
      setFile(null);
      router.refresh();
    } catch {
      setError(de.task.uploadError);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{de.hubBanners.hint}</p>

      {/* Existing banners */}
      {banners.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {banners.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-3 rounded-lg border p-2"
            >
              <div
                className="h-12 w-20 shrink-0 rounded-md border bg-muted"
                style={{
                  background: `url("${b.imageUrl}") center / cover no-repeat`,
                }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{b.name}</div>
                <div className="text-xs text-muted-foreground">
                  {b.exclusive
                    ? '🎁 nur über Lootbox'
                    : `${de.hubBanners.fromLevel} ${b.unlockLevel}${b.coinPrice > 0 ? ` · 🪙 ${b.coinPrice}` : ''}`}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deleting}
                aria-label={de.common.delete}
                onClick={() =>
                  startDelete(async () => {
                    await deleteHubBannerAction(b.id);
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
        <p className="text-sm text-muted-foreground">{de.hubBanners.empty}</p>
      )}

      {/* Upload form */}
      <div className="space-y-3 rounded-lg border p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {de.hubBanners.addTitle}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {de.hubBanners.nameLabel}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={de.hubBanners.namePlaceholder}
              maxLength={80}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {de.hubBanners.levelLabel}
            </label>
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
          <span>🎁 Exklusiv – nur über Lootbox erhältlich (nicht per Level freischaltbar)</span>
        </label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block text-sm"
        />
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button type="button" size="sm" onClick={upload} disabled={uploading}>
          {uploading ? de.common.loading : de.hubBanners.upload}
        </Button>
      </div>
    </div>
  );
}
