'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/authz/authorize';
import { isSuperAdmin } from '@/lib/authz/policies';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { ingestKnowledge } from '@/features/assistant/knowledge';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { de } from '@/lib/i18n/de';

/** Fügt ein Wissens-Dokument hinzu (Titel + Text). Nur Super-Admin. */
export async function addKnowledgeAction(
  title: string,
  content: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSuperAdmin(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);
  if (!title.trim() || !content.trim()) return errorResult(de.errors.VALIDATION);

  const res = await ingestKnowledge(orgId, user.id, title, content);
  if (!res.ok) return errorResult(res.error ?? de.errors.INTERNAL);

  revalidatePath('/app/assistant');
  return successResult(`Gespeichert (${res.chunks} Abschnitt(e)).`);
}

/** Löscht ein Wissens-Dokument samt Abschnitten. Nur Super-Admin. */
export async function deleteKnowledgeAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSuperAdmin(user)) return errorResult(de.errors.FORBIDDEN);

  // ON DELETE CASCADE entfernt die Abschnitte mit.
  const { error } = await createSupabaseServiceClient()
    .from('assistant_knowledge_docs')
    .delete()
    .eq('id', id);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/assistant');
  return successResult('Gelöscht.');
}
