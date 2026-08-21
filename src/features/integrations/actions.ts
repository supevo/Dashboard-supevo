'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { de } from '@/lib/i18n/de';
import {
  getSearchConsoleSnapshot,
  type SnapshotResult,
} from '@/features/integrations/queries';

async function authorizeClient(
  clientCompanyId: string,
): Promise<{ orgId: string } | { error: string }> {
  if (!z.string().uuid().safeParse(clientCompanyId).success) {
    return { error: de.errors.VALIDATION };
  }
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return { error: de.errors.FORBIDDEN };
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return { error: de.errors.FORBIDDEN };

  const service = createSupabaseServiceClient();
  const { data: company } = await service
    .from('client_companies')
    .select('organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!company || company.organization_id !== orgId) {
    return { error: de.errors.FORBIDDEN };
  }
  return { orgId };
}

/** Lädt on-demand die Search-Console-Kennzahlen eines Kunden (zum Testen). */
export async function loadSearchConsoleAction(
  clientCompanyId: string,
): Promise<SnapshotResult> {
  const auth = await authorizeClient(clientCompanyId);
  if ('error' in auth) return { ok: false, error: auth.error };
  return getSearchConsoleSnapshot(clientCompanyId, auth.orgId);
}

/** Trennt die Google-Verbindung eines Kunden (löscht den gespeicherten Token). */
export async function disconnectGoogleAction(
  clientCompanyId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await authorizeClient(clientCompanyId);
  if ('error' in auth) return { ok: false, error: auth.error };

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('client_integrations')
    .delete()
    .eq('organization_id', auth.orgId)
    .eq('client_company_id', clientCompanyId)
    .eq('provider', 'google_search_console');
  if (error) return { ok: false, error: de.errors.INTERNAL };

  revalidatePath('/app/integrations');
  return { ok: true };
}
