'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { formatEuroCents } from '@/lib/money';
import { de } from '@/lib/i18n/de';

/**
 * Markiert das einmalige Google-Ads-Guthaben eines Kunden als eingelöst (bzw.
 * nimmt die Einlösung zurück). Nur Agentur. Beim Einlösen wird der Kunde
 * benachrichtigt – so sieht er im Portal, dass das im Termin versprochene
 * Guthaben eingelöst wurde.
 */
export async function redeemAdsCreditAction(
  clientCompanyId: string,
  redeem: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(clientCompanyId).success) {
    return { ok: false, error: de.errors.VALIDATION };
  }
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return { ok: false, error: de.errors.FORBIDDEN };
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return { ok: false, error: de.errors.FORBIDDEN };

  const service = createSupabaseServiceClient();
  const { data: m } = await service
    .from('client_memberships')
    .select('organization_id, ads_credit_cents')
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();
  if (!m || m.organization_id !== orgId) {
    return { ok: false, error: de.errors.FORBIDDEN };
  }

  const { error } = await service
    .from('client_memberships')
    .update({ ads_credit_redeemed_at: redeem ? new Date().toISOString() : null })
    .eq('client_company_id', clientCompanyId);
  if (error) return { ok: false, error: de.errors.INTERNAL };

  if (redeem) {
    const { data: contacts } = await service
      .from('client_contacts')
      .select('user_id')
      .eq('client_company_id', clientCompanyId);
    const recipientIds = [...new Set((contacts ?? []).map((c) => c.user_id))];
    if (recipientIds.length > 0) {
      await createNotifications(
        recipientIds.map((recipientId) => ({
          organizationId: orgId,
          recipientId,
          type: 'onboarding' as const,
          title: 'Google-Ads-Guthaben eingelöst',
          body: `Ihr Guthaben von ${formatEuroCents(m.ads_credit_cents ?? 0)} für Google Ads wurde eingelöst.`,
          entityType: 'client_membership',
          entityId: clientCompanyId,
        })),
        user.id,
      );
    }
  }

  revalidatePath(`/app/clients/${clientCompanyId}`);
  revalidatePath('/portal/membership');
  return { ok: true };
}
