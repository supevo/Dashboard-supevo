/**
 * Lädt eine Datei über eine (serverseitig erzeugte) OneDrive-Upload-Session
 * direkt in den Browser hoch – in Chunks. Microsoft Graph begrenzt ein einzelnes
 * PUT-Fragment auf ~60 MiB; große Dateien MÜSSEN daher stückweise hochgeladen
 * werden. Die Session ist resumable, wir laden hier aber sequentiell von vorne.
 *
 * Chunkgröße: 10 MiB. Jedes Fragment außer dem letzten muss ein Vielfaches von
 * 320 KiB sein (10 MiB = 32 × 320 KiB, passt exakt).
 */
const ONEDRIVE_CHUNK_BYTES = 10 * 1024 * 1024;

export interface OneDriveUploadResult {
  ok: boolean;
  itemId?: string;
  error?: string;
}

export async function uploadFileToOneDriveSession(
  uploadUrl: string,
  file: File,
): Promise<OneDriveUploadResult> {
  const total = file.size;
  if (total <= 0) return { ok: false, error: 'Die Datei ist leer.' };

  let start = 0;
  while (start < total) {
    const end = Math.min(start + ONEDRIVE_CHUNK_BYTES, total);
    const slice = file.slice(start, end);
    let res: Response;
    try {
      // Content-Length wird vom Browser automatisch gesetzt (Forbidden Header).
      res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${start}-${end - 1}/${total}` },
        body: slice,
      });
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }

    // 202 Accepted → weitere Fragmente erwartet. 200/201 → letztes Fragment ok,
    // Body enthält das erzeugte driveItem (mit id).
    if (res.status === 202) {
      start = end;
      continue;
    }
    if (res.ok) {
      const item = (await res.json().catch(() => null)) as { id?: string } | null;
      if (!item?.id) return { ok: false, error: 'OneDrive-Antwort ohne Item-ID.' };
      return { ok: true, itemId: item.id };
    }
    return { ok: false, error: `OneDrive-Upload fehlgeschlagen (HTTP ${res.status}).` };
  }

  // Schleife beendet ohne finalen 200/201 → unerwartet.
  return { ok: false, error: 'OneDrive-Upload unvollständig.' };
}
