'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { FILES_BUCKET, SIGNED_URL_TTL_SECONDS } from '@/lib/files/storage';
import { listFolder, getDownloadUrl, resolveFolderByPath } from '@/lib/onedrive/graph';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

type Service = ReturnType<typeof createSupabaseServiceClient>;
type Kind = 'sepa_mandate' | 'contract';
const kindSchema = z.enum(['sepa_mandate', 'contract']);

/** Org des Kunden auflösen (Service-Client). */
async function orgOfClient(service: Service, clientCompanyId: string): Promise<string | null> {
  const { data } = await service
    .from('client_companies')
    .select('organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  return data?.organization_id ?? null;
}

/** Vorhandenes Dokument (Kunde+Art) laden – zum Ersetzen/Aufräumen. */
async function existingDoc(
  service: Service,
  clientCompanyId: string,
  kind: Kind,
): Promise<{ id: string; source: string; file_path: string | null } | null> {
  const { data } = await service
    .from('client_documents')
    .select('id, source, file_path')
    .eq('client_company_id', clientCompanyId)
    .eq('kind', kind)
    .maybeSingle();
  return data ?? null;
}

/** Alten Upload aus dem Storage entfernen (best effort). */
async function removeOldUpload(
  service: Service,
  prev: { source: string; file_path: string | null } | null,
): Promise<void> {
  if (prev?.source === 'upload' && prev.file_path) {
    await service.storage.from(FILES_BUCKET).remove([prev.file_path]);
  }
}

function sanitizeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'datei';
}

/** Datei-Upload eines Kundendokuments (SEPA-Mandat / Vertrag) → Storage. */
export async function uploadClientDocumentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const clientCompanyId = String(formData.get('clientCompanyId') ?? '');
  const kindParsed = kindSchema.safeParse(formData.get('kind'));
  const file = formData.get('file');
  if (!z.string().uuid().safeParse(clientCompanyId).success || !kindParsed.success) {
    return errorResult(de.errors.VALIDATION);
  }
  if (!(file instanceof File) || file.size === 0) {
    return errorResult('Bitte eine Datei auswählen.');
  }
  if (file.size > 25 * 1024 * 1024) {
    return errorResult('Datei ist zu groß (max. 25 MB).');
  }

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();
  const orgId = await orgOfClient(service, clientCompanyId);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const kind = kindParsed.data;
  const safe = sanitizeName(file.name);
  const path = `org/${orgId}/client-docs/${clientCompanyId}/${kind}/${Date.now()}-${safe}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await service.storage
    .from(FILES_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });
  if (upErr) return errorResult('Upload fehlgeschlagen: ' + upErr.message);

  const prev = await existingDoc(service, clientCompanyId, kind);
  await removeOldUpload(service, prev);

  const { error } = await service.from('client_documents').upsert(
    {
      organization_id: orgId,
      client_company_id: clientCompanyId,
      kind,
      source: 'upload',
      file_path: path,
      onedrive_item_id: null,
      web_url: null,
      name: file.name,
      created_by: user.id,
    },
    { onConflict: 'client_company_id,kind' },
  );
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('Dokument hochgeladen.');
}

const attachSchema = z.object({
  clientCompanyId: z.string().uuid(),
  kind: kindSchema,
  itemId: z.string().min(1).max(400),
  name: z.string().min(1).max(300),
  webUrl: z.string().max(2000).optional().or(z.literal('')),
  isFolder: z.boolean(),
});

/** OneDrive-Ordner oder -Datei als Kundendokument verknüpfen (Referenz). */
export async function attachOneDriveDocumentAction(input: unknown): Promise<ActionResult> {
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const d = parsed.data;

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();
  const orgId = await orgOfClient(service, d.clientCompanyId);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const prev = await existingDoc(service, d.clientCompanyId, d.kind);
  await removeOldUpload(service, prev);

  const { error } = await service.from('client_documents').upsert(
    {
      organization_id: orgId,
      client_company_id: d.clientCompanyId,
      kind: d.kind,
      source: d.isFolder ? 'onedrive_folder' : 'onedrive_file',
      file_path: null,
      onedrive_item_id: d.itemId,
      web_url: d.webUrl || null,
      name: d.name,
      created_by: user.id,
    },
    { onConflict: 'client_company_id,kind' },
  );
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(`/app/clients/${d.clientCompanyId}`);
  return successResult('OneDrive-Dokument verknüpft.');
}

/** Hinterlegtes Dokument entfernen (inkl. Storage-Datei bei Upload). */
export async function removeClientDocumentAction(
  clientCompanyId: string,
  kind: string,
): Promise<ActionResult> {
  const kindParsed = kindSchema.safeParse(kind);
  if (!z.string().uuid().safeParse(clientCompanyId).success || !kindParsed.success) {
    return errorResult(de.errors.VALIDATION);
  }
  const k = kindParsed.data;
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();
  const prev = await existingDoc(service, clientCompanyId, k);
  await removeOldUpload(service, prev);
  await service
    .from('client_documents')
    .delete()
    .eq('client_company_id', clientCompanyId)
    .eq('kind', k);

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('Dokument entfernt.');
}

/**
 * Löst einen OneDrive-Pfad (z. B. "ONE STEP/Kunden") in eine Ordner-ID auf, um
 * den Browser direkt dort zu starten. Gibt null-Daten zurück, wenn nicht
 * gefunden (dann startet der Browser im Root).
 */
export async function resolveOneDriveFolderAction(path: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);
  const clean = String(path ?? '').trim();
  if (!clean) return successResult('', { id: null, name: null });
  const folder = await resolveFolderByPath(orgId, clean);
  const name = clean.split('/').filter(Boolean).pop() ?? clean;
  return successResult('', { id: folder?.id ?? null, name });
}

/** Listet einen OneDrive-Ordner (Root, wenn folderId leer) für die Auswahl. */
export async function browseOneDriveAction(folderId: string | null): Promise<ActionResult> {
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const items = await listFolder(orgId, folderId && folderId.length > 0 ? folderId : null);
  if (items === null) {
    return errorResult('OneDrive ist nicht verbunden oder nicht erreichbar.');
  }
  return successResult('', {
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      isFolder: i.isFolder,
      webUrl: i.webUrl,
    })),
  });
}

/** Öffnen-Link zu einem hinterlegten Dokument (Signed-URL bzw. OneDrive-Link). */
export async function clientDocumentUrlAction(docId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(docId).success) return errorResult(de.errors.VALIDATION);
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();
  const { data: doc } = await service
    .from('client_documents')
    .select('organization_id, source, file_path, onedrive_item_id, web_url')
    .eq('id', docId)
    .maybeSingle();
  if (!doc) return errorResult(de.errors.NOT_FOUND);

  if (doc.source === 'upload' && doc.file_path) {
    const { data } = await service.storage
      .from(FILES_BUCKET)
      .createSignedUrl(doc.file_path, SIGNED_URL_TTL_SECONDS, { download: true });
    if (data?.signedUrl) return successResult('', { url: data.signedUrl });
    return errorResult('Link konnte nicht erzeugt werden.');
  }
  if (doc.web_url) return successResult('', { url: doc.web_url });
  if (doc.onedrive_item_id) {
    const dl = await getDownloadUrl(doc.organization_id, doc.onedrive_item_id);
    if (dl?.url) return successResult('', { url: dl.url });
  }
  return errorResult('Kein Link verfügbar.');
}
