'use client';

/**
 * Direct-to-storage Upload einer Datei in einen Chat-Kanal (signiertes Ziel →
 * Browser-Upload → finalize). Von ChatAttachButton (Klick) und den Composern
 * (Einfügen per Strg/Cmd+V) gemeinsam genutzt. Wirft nie – meldet über das
 * Rückgabeobjekt.
 */
export async function uploadChatFile(
  channelId: string,
  file: File,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const createRes = await fetch('/api/chat-files/create-upload-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
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
    if (!createRes.ok || !created.path || !created.token || !created.storagePath) {
      return { ok: false, error: created.error ?? 'Upload fehlgeschlagen.' };
    }

    const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
    const supabase = createSupabaseBrowserClient();
    const { error: upErr } = await supabase.storage
      .from('files')
      .uploadToSignedUrl(created.path, created.token, file, { contentType: file.type });
    if (upErr) return { ok: false, error: 'Upload fehlgeschlagen.' };

    const finRes = await fetch('/api/chat-files/finalize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        storagePath: created.storagePath,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }),
    });
    const fin = (await finRes.json()) as { ok?: boolean; error?: string };
    if (!finRes.ok || !fin.ok) {
      return { ok: false, error: fin.error ?? 'Upload fehlgeschlagen.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Upload fehlgeschlagen.' };
  }
}

/** Erstes Bild aus Zwischenablage-Items ziehen (für onPaste im Chat). */
export function pastedImageFile(items: DataTransferItemList | null | undefined): File | null {
  if (!items) return null;
  for (const it of Array.from(items)) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) return f;
    }
  }
  return null;
}
