'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { addAssistantMemory } from '@/features/assistant/memory';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { de } from '@/lib/i18n/de';

/** Fügt einen Gedächtnis-Eintrag hinzu (agenturweit). Agentur-Mitarbeiter. */
export async function addAssistantMemoryAction(
  content: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);
  const text = content.trim();
  if (!text) return errorResult(de.errors.VALIDATION);

  const ok = await addAssistantMemory(orgId, user.id, text);
  if (!ok) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/assistant');
  return successResult('Gemerkt.');
}

/** Löscht einen Gedächtnis-Eintrag (RLS beschränkt auf die eigene Org). */
export async function deleteAssistantMemoryAction(
  id: string,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('assistant_memory').delete().eq('id', id);
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/assistant');
  return successResult('Gelöscht.');
}
