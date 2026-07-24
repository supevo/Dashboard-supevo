'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Alert } from '@/components/ui/alert';
import { de } from '@/lib/i18n/de';

/** Uploads a profile picture and refreshes so the new avatar appears. */
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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Cache-busting key so the <img> reloads after a successful upload.
  const [version, setVersion] = useState(0);

  async function upload(file: File) {
    setError(null);
    setPending(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/profiles/avatar', {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? de.task.uploadError);
      } else {
        setVersion((v) => v + 1);
        router.refresh();
      }
    } catch {
      setError(de.task.uploadError);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar
        key={version}
        userId={userId}
        name={name}
        hasAvatar={hasAvatar || version > 0}
        size="lg"
      />
      <div className="space-y-2">
        {error && <Alert variant="destructive">{error}</Alert>}
        <label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={pending}
            className="block text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          {pending ? de.common.loading : 'PNG, JPG, WebP oder GIF · max. 5 MB'}
        </p>
      </div>
    </div>
  );
}
