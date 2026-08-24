'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/authz/authorize';
import { isSuperAdmin } from '@/lib/authz/policies';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { parseInquiryEmail } from '@/features/inquiries/ai-parse';
import { de } from '@/lib/i18n/de';

type Result = { ok: boolean; error?: string };

async function requireSuperAdmin(): Promise<{ orgId: string } | { error: string }> {
  const user = await requireUser();
  if (!isSuperAdmin(user)) return { error: de.errors.FORBIDDEN };
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return { error: de.errors.FORBIDDEN };
  return { orgId };
}

/** Verwirft eine Quarantäne-Mail endgültig. */
export async function deleteQuarantineAction(id: string): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: de.errors.VALIDATION };
  const auth = await requireSuperAdmin();
  if ('error' in auth) return { ok: false, error: auth.error };

  const service = createSupabaseServiceClient();
  const { error } = await service.from('inbound_quarantine').delete().eq('id', id);
  if (error) return { ok: false, error: de.errors.INTERNAL };
  revalidatePath('/app/inbound-quarantine');
  return { ok: true };
}

/**
 * Ordnet eine Quarantäne-Mail manuell einem Kunden zu: legt daraus eine Anfrage
 * an (Felder per KI/Heuristik ausgelesen) und markiert die Quarantäne als erledigt.
 */
export async function assignQuarantineAction(input: {
  id: string;
  clientCompanyId: string;
}): Promise<Result> {
  const parsed = z
    .object({ id: z.string().uuid(), clientCompanyId: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: de.errors.VALIDATION };
  const auth = await requireSuperAdmin();
  if ('error' in auth) return { ok: false, error: auth.error };

  const service = createSupabaseServiceClient();
  const { data: q } = await service
    .from('inbound_quarantine')
    .select('id, subject, body, from_address')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!q) return { ok: false, error: de.errors.NOT_FOUND };

  // Zielkunde muss zur Org des Super-Admins gehören.
  const { data: company } = await service
    .from('client_companies')
    .select('id, organization_id')
    .eq('id', parsed.data.clientCompanyId)
    .maybeSingle();
  if (!company || company.organization_id !== auth.orgId) {
    return { ok: false, error: de.errors.FORBIDDEN };
  }

  const fields = await parseInquiryEmail(q.subject ?? '', q.body ?? '');
  const { error: insErr } = await service.from('web_inquiries').insert({
    organization_id: company.organization_id,
    client_company_id: company.id,
    name: fields.name,
    email: fields.email ?? q.from_address,
    phone: fields.phone,
    subject: fields.subject,
    message: fields.message,
    source: 'E-Mail (manuell zugeordnet)',
    payload: { channel: 'email', manual: true, from: q.from_address },
  });
  if (insErr) return { ok: false, error: de.errors.INTERNAL };

  await service
    .from('inbound_quarantine')
    .update({ resolved: true })
    .eq('id', parsed.data.id);

  revalidatePath('/app/inbound-quarantine');
  revalidatePath(`/app/clients/${company.id}`);
  return { ok: true };
}
