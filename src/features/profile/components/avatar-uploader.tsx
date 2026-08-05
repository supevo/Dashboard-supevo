'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DropZone } from '@/components/ui/drop-zone';
import { de } from '@/lib/i18n/de';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB – mirrors the API limit.
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/**
 * Lets a user pick a new profile picture, preview it, and save it explicitly.
 * Nothing is uploaded until "Speichern" is pressed, so an accidental pick can
 * be cancelled. On success the avatar is refreshed everywhere (the server
 * revalidates the cached image via its ETag).
 */
export function AvatarUploader({
  userId,
  name,
  hasAvatar,
}: {
  userId: string;
  name: string;
  hasAvatar: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // Cache-busting key so the <img> reloads after a successful save.
  const [version, setVersion] = useState(0);

  // Keep the object URL alive only while a pick is pending; revoke on change.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(next: File | null) {
    setError(null);
    setDone(false);
    if (!next) return;
    if (!ALLOWED.includes(next.type)) {
      setError('Bitte ein Bild (PNG, JPG, WebP, GIF) wählen.');
      return;
    }
    if (next.size <= 0 || next.size > MAX_BYTES) {
      setError('Das Bild ist zu groß (max. 5 MB).');
      return;
    }
    setFile(next);
  }

  function cancel() {
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function save() {
    if (!file) return;
    setError(null);
    setPending(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/profiles/avatar', { method: 'POST', body: fd });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? de.task.uploadError);
      } else {
        setVersion((v) => v + 1);
        setDone(true);
        cancel();
        router.refresh();
      }
    } catch {
      setError(de.task.uploadError);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-start gap-4">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt=""
          className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-primary"
        />
      ) : (
        <Avatar
          userId={userId}
          name={name}
          hasAvatar={hasAvatar || version > 0}
          size="lg"
          bust={version}
        />
      )}

      <DropZone className="space-y-2" overlayLabel="Bild hier ablegen">
        {error && <Alert variant="destructive">{error}</Alert>}
        {done && !file && (
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Profilbild aktualisiert ✓
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={pending}
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />

        {!file ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            Bild auswählen …
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={save}>
              {pending ? de.common.loading : 'Speichern'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={cancel}
            >
              Abbrechen
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {file
            ? `Ausgewählt: ${file.name} – zum Übernehmen auf „Speichern" tippen.`
            : 'PNG, JPG, WebP oder GIF · max. 5 MB'}
        </p>
      </DropZone>
    </div>
  );
}
