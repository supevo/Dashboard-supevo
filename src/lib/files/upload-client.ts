import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// Bucket name (kept in sync with FILES_BUCKET in the server-only storage lib,
// which cannot be imported into a client module).
const FILES_BUCKET = 'files';

/** Computes a SHA-256 hex digest of the file in the browser (integrity check). */
async function sha256Hex(file: File): Promise<string | null> {
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null; // Non-secure context: checksum is optional.
  }
}

/**
 * Uploads a file to a task using the direct-to-storage flow
 * (create-upload-url → upload bytes → finalize). Returns ok/error.
 */
export async function uploadFileToTask({
  projectId,
  taskId,
  file,
  isInternal,
}: {
  projectId: string;
  taskId: string;
  file: File;
  isInternal: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const createRes = await fetch('/api/files/create-upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId,
      taskId,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    }),
  });
  const createJson = (await createRes.json()) as {
    path?: string;
    token?: string;
    storagePath?: string;
    error?: string;
  };
  if (!createRes.ok || !createJson.path || !createJson.token) {
    return { ok: false, error: createJson.error };
  }

  const supabase = createSupabaseBrowserClient();
  const { error: uploadError } = await supabase.storage
    .from(FILES_BUCKET)
    .uploadToSignedUrl(createJson.path, createJson.token, file, {
      contentType: file.type,
    });
  if (uploadError) return { ok: false, error: uploadError.message };

  const checksum = await sha256Hex(file);
  const finalizeRes = await fetch('/api/files/finalize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId,
      taskId,
      storagePath: createJson.storagePath,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      checksum,
      isInternal,
    }),
  });
  const finalizeJson = (await finalizeRes.json()) as {
    ok?: boolean;
    error?: string;
  };
  if (!finalizeRes.ok || !finalizeJson.ok) {
    return { ok: false, error: finalizeJson.error };
  }
  return { ok: true };
}
