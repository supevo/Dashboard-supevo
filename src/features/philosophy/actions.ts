'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { isOrgAdmin } from '@/lib/authz/policies';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const textSchema = z.string().trim().min(2).max(400);

async function requirePhilosophyAdmin(): Promise<
  { orgId: string } | { error: string }
> {
  const user = await requireUser();
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) return { error: de.errors.FORBIDDEN };
  return { orgId };
}

/** Fügt einen Philosophie-Text hinzu (Org-Admin). */
export async function createPhilosophyQuoteAction(
  text: string,
): Promise<ActionResult> {
  const parsed = textSchema.safeParse(text);
  if (!parsed.success) return errorResult('Bitte einen Text (2–400 Zeichen) angeben.');
  const auth = await requirePhilosophyAdmin();
  if ('error' in auth) return errorResult(auth.error);

  const service = createSupabaseServiceClient();
  const { error } = await service.from('philosophy_quotes').insert({
    organization_id: auth.orgId,
    text: parsed.data,
    active: true,
    position: Date.now(),
  } as never);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/settings');
  revalidatePath('/app');
  return successResult('Text hinzugefügt.');
}

/** Bearbeitet Text bzw. Aktiv-Status eines Philosophie-Textes (Org-Admin). */
export async function updatePhilosophyQuoteAction(input: {
  id: string;
  text?: string;
  active?: boolean;
}): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(input.id);
  if (!id.success) return errorResult(de.errors.VALIDATION);
  const auth = await requirePhilosophyAdmin();
  if ('error' in auth) return errorResult(auth.error);

  const patch: { text?: string; active?: boolean } = {};
  if (input.text !== undefined) {
    const t = textSchema.safeParse(input.text);
    if (!t.success) return errorResult('Bitte einen Text (2–400 Zeichen) angeben.');
    patch.text = t.data;
  }
  if (input.active !== undefined) patch.active = input.active;
  if (Object.keys(patch).length === 0) return successResult('Nichts geändert.');

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('philosophy_quotes')
    .update(patch as never)
    .eq('id', id.data)
    .eq('organization_id', auth.orgId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/settings');
  revalidatePath('/app');
  return successResult('Gespeichert.');
}

/** Löscht einen Philosophie-Text (Org-Admin). */
export async function deletePhilosophyQuoteAction(
  quoteId: string,
): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(quoteId);
  if (!id.success) return errorResult(de.errors.VALIDATION);
  const auth = await requirePhilosophyAdmin();
  if ('error' in auth) return errorResult(auth.error);

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('philosophy_quotes')
    .delete()
    .eq('id', id.data)
    .eq('organization_id', auth.orgId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/settings');
  revalidatePath('/app');
  return successResult('Gelöscht.');
}
