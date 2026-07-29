import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hasAgencyAccess } from '@/features/auth/access';
import { requireUser } from '@/lib/authz/authorize';

export interface AssetAccess {
  orgId: string;
  /** True for agency staff of the company's org; false for a client contact. */
  isAgency: boolean;
}

/**
 * Authorizes access to a client's Marken-Hub for the current user. Reads the
 * company through the caller's RLS-scoped client: agency staff see their org's
 * companies, a client sees only companies they are a contact of. A successful
 * read therefore both authorizes the caller and yields the organization id.
 * Returns null when the caller may not touch this company's hub.
 */
export async function resolveAssetAccess(
  clientCompanyId: string,
): Promise<AssetAccess | null> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: company } = await supabase
    .from('client_companies')
    .select('organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!company) return null;

  const isAgency =
    hasAgencyAccess(user) &&
    user.memberships.some((m) => m.organizationId === company.organization_id);

  return { orgId: company.organization_id, isAgency };
}
