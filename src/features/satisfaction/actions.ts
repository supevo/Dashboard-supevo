'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { hasClientAccess } from '@/features/auth/access';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { currentMonthStart, getMyClientCompany } from './queries';

const schema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().or(z.literal('')),
});

/** Records/updates the current client's satisfaction rating for this month. */
export async function setSatisfactionAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    rating: formData.get('rating'),
    comment: formData.get('comment') ?? '',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  if (!hasClientAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const company = await getMyClientCompany();
  if (!company) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('client_satisfaction').upsert(
    {
      organization_id: company.organizationId,
      client_company_id: company.clientCompanyId,
      month: currentMonthStart(),
      rating: parsed.data.rating,
      comment: parsed.data.comment ? parsed.data.comment : null,
      created_by: user.id,
    },
    { onConflict: 'client_company_id,month' },
  );
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/portal');
  return successResult('Danke für Ihr Feedback!');
}
