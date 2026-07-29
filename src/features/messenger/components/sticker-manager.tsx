'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteStickerAction } from '@/features/messenger/actions';
import type { StickerItem } from '@/features/messenger/queries';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/** Settings panel to upload/manage team chat stickers (small images). */
export function StickerManager({ stickers }: { stickers: StickerItem[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, startDelete] = useTransition();

  async function upload() {
    if (!file) {
      setError('Bitte ein Bild wählen.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('name', name || 'Sticker');
      const res = await fetch('/api/chat-stickers', { method: 'POST', body: fd });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Upload fehlgeschlagen.');
        return;
      }
      setName('');
      setFile(null);
      router.refresh();
    } catch {
      setError('Upload fehlgeschlagen.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Kleine Bilder (PNG, JPG, WebP, GIF – max. 1 MB), die das Team im Chat als
        Sticker senden kann.
      </p>

      {stickers.length > 0 ? (
        <ul className="flex flex-wrap gap-3">
          {stickers.map((s) => (
            <li
              key={s.id}
              className="group relative rounded-lg border p-2"
              title={s.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt={s.name} className="h-16 w-16 object-contain" />
              <button
                type="button"
                disabled={deleting}
                aria-label="Sticker löschen"
                onClick={() =>
                  startDelete(async () => {
                    await deleteStickerAction(s.id);
                    router.refresh();
                  })
                }
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border bg-card text-xs shadow hover:bg-muted"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Noch keine Sticker.</p>
      )}

      <div className="space-y-2 rounded-lg border p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sticker hinzufügen
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          maxLength={40}
          className="max-w-xs"
        />
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block text-sm"
        />
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button type="button" size="sm" onClick={upload} disabled={uploading}>
          {uploading ? 'Wird hochgeladen …' : 'Hochladen'}
        </Button>
      </div>
    </div>
  );
}
