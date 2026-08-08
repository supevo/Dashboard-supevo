'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { sanitizeRichText } from '@/lib/sanitize';
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
