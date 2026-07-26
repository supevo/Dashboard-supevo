'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const createSchema = z.object({
  contactName: z.string().trim().min(1, 'Bitte einen Namen angeben.').max(200),
  company: z.string().max(200).optional().or(z.literal('')),
  email: z.string().email().max(200).optional().or(z.literal('')),
  phone: z.string().max(60).optional().or(z.literal('')),
  source: z.string().max(120).optional().or(z.literal('')),
  note: z.string().max(4000).optional().or(z.literal('')),
  value: z.string().max(20).optional().or(z.literal('')),
});

function parseEuroToCents(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** Creates a new lead in the pipeline (agency staff). */
export async function createLeadAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse({
    contactName: formData.get('contactName'),
    company: formData.get('company') ?? '',
    email: formData.get('email') ?? '',
    phone: formData.get('phone') ?? '',
    source: formData.get('source') ?? '',
    note: formData.get('note') ?? '',
    value: formData.get('value') ?? '',
  });
  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? de.errors.VALIDATION);
  }
  const d = parsed.data;

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('leads').insert({
    organization_id: orgId,
    contact_name: d.contactName,
    company: d.company || null,
    email: d.email || null,
    phone: d.phone || null,
    source: d.source || null,
    note: d.note || null,
    estimated_value_cents: parseEuroToCents(d.value ?? ''),
    created_by: user.id,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/leads');
  return successResult('Lead angelegt.');
}

/** Moves a lead to another pipeline status. */
export async function setLeadStatusAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      status: z.enum(['new', 'contacted', 'offer', 'won', 'lost']),
    })
    .safeParse({ id: formData.get('id'), status: formData.get('status') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('leads')
    .update({ status: parsed.data.status }, { count: 'exact' })
    .eq('id', parsed.data.id);
  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/leads');
  return successResult('Status aktualisiert.');
}

/** Deletes a lead. */
export async function deleteLeadAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('leads').delete().eq('id', id.data);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/leads');
  return successResult('Lead gelöscht.');
}
