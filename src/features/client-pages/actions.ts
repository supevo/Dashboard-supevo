'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { sanitizeRichText } from '@/lib/sanitize';
import { FILES_BUCKET } from '@/lib/files/storage';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import {
  createClientPageSchema,
  updateClientPageSchema,
  deleteClientPageSchema,
} from './schema';

function revalidateClient(formData: FormData) {
  const cid = formData.get('clientCompanyId');
  if (typeof cid === 'string' && cid) {
    revalidatePath(`/app/clients/${cid}`);
  }
}

export async function createClientPageAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createClientPageSchema.safeParse({
    clientCompanyId: formData.get('clientCompanyId'),
    title: formData.get('title'),
    isFolder: formData.get('isFolder') ?? 'false',
    parentId: formData.get('parentId') ?? '',
  });
  if (!parsed.success) {
    return errorResult(
      parsed.error.flatten().fieldErrors.title?.[0] ?? de.errors.VALIDATION,
    );
  }
  const { clientCompanyId, title, isFolder, parentId } = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Resolve the owning org via the RLS-scoped client (returns nothing if the
  // caller can't see the client company).
  const { data: company } = await supabase
    .from('client_companies')
    .select('organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!company) return errorResult(de.errors.FORBIDDEN);

  // client_pages is not in the generated Database types (migration 0107); the
  // payload/result are cast to bypass the `never` inference.
  const { data, error } = await supabase
    .from('client_pages')
    .insert({
      organization_id: company.organization_id,
      client_company_id: clientCompanyId,
      parent_id: parentId ? parentId : null,
      is_folder: isFolder === 'true',
      title,
      status: 'draft',
      position: Date.now(),
      created_by: user.id,
    } as never)
    .select('id')
    .maybeSingle();

  if (error) {
    logger.error('Seite anlegen fehlgeschlagen', {
      code: error.code,
      message: error.message,
    });
    return errorResult(de.errors.INTERNAL);
  }

  revalidateClient(formData);
  return successResult('Angelegt.', {
    pageId: (data as { id: string } | null)?.id,
  });
}

export async function updateClientPageAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateClientPageSchema.safeParse({
    id: formData.get('id'),
    title: formData.get('title'),
    content: formData.get('content') ?? '',
    status: formData.get('status'),
  });
  if (!parsed.success) {
    return errorResult(
      parsed.error.flatten().fieldErrors.title?.[0] ?? de.errors.VALIDATION,
    );
  }
  const { id, title, content, status } = parsed.data;

  await requireUser();
  const supabase = await createSupabaseServerClient();
  // Sanitize the rich-text HTML before storage (strict allowlist – no script,
  // styles, event handlers or javascript: URLs survive).
  const cleanContent = content ? sanitizeRichText(content) : '';
  // RLS is the hard guard; an unauthorized update affects zero rows.
  const { error, count } = await supabase
    .from('client_pages')
    .update({ title, content: cleanContent, status } as never, {
      count: 'exact',
    })
    .eq('id', id);

  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  revalidateClient(formData);
  return successResult('Gespeichert.');
}

const linkTaskSchema = z.object({
  pageId: z.string().uuid(),
  taskId: z.string().uuid(),
});

export async function linkClientPageTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = linkTaskSchema.safeParse({
    pageId: formData.get('pageId'),
    taskId: formData.get('taskId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { pageId, taskId } = parsed.data;

  await requireUser();
  const supabase = await createSupabaseServerClient();

  // Resolve the page's org via RLS (nothing back if the caller can't see it).
  const { data: page } = await supabase
    .from('client_pages')
    .select('organization_id')
    .eq('id', pageId)
    .maybeSingle();
  if (!page) return errorResult(de.errors.FORBIDDEN);

  const { error } = await supabase.from('client_page_tasks').upsert(
    {
      page_id: pageId,
      task_id: taskId,
      organization_id: (page as { organization_id: string }).organization_id,
    } as never,
    { onConflict: 'page_id,task_id', ignoreDuplicates: true },
  );
  if (error) return errorResult(de.errors.INTERNAL);

  revalidateClient(formData);
  return successResult('Verknüpft.');
}

export async function unlinkClientPageTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = linkTaskSchema.safeParse({
    pageId: formData.get('pageId'),
    taskId: formData.get('taskId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('client_page_tasks')
    .delete()
    .eq('page_id', parsed.data.pageId)
    .eq('task_id', parsed.data.taskId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidateClient(formData);
  return successResult('Entfernt.');
}

export async function deleteClientPageAttachmentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = formData.get('id');
  if (typeof id !== 'string' || !id) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();

  // Read the storage path (RLS-gated) before deleting the row.
  const { data } = await supabase
    .from('client_page_attachments')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();
  if (!data) return errorResult(de.errors.FORBIDDEN);
  const storagePath = (data as { storage_path: string }).storage_path;

  const { error, count } = await supabase
    .from('client_page_attachments')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  // Best-effort object removal (the row is already gone either way).
  try {
    await createSupabaseServiceClient()
      .storage.from(FILES_BUCKET)
      .remove([storagePath]);
  } catch (e) {
    logger.warn('client_page_attachment.storage_remove_failed', {
      error: (e as Error).message,
    });
  }

  revalidateClient(formData);
  return successResult('Gelöscht.');
}

export async function deleteClientPageAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteClientPageSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('client_pages')
    .delete()
    .eq('id', parsed.data.id);

  if (error) return errorResult(de.errors.INTERNAL);

  revalidateClient(formData);
  return successResult('Gelöscht.');
}
