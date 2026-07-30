import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { hasAgencyAccess } from '@/features/auth/access';
import { requireUser } from '@/lib/authz/authorize';

export interface AssetAccess {
  orgId: string;
  /** True for agency staff of the company's org; false for a client contact. */
  isAgency: boolean;
}

/**
 * Authorizes access to a client's Marken-Hub for the current user. The company's
 * organization is resolved via the service client (RLS-independent), then the
 * caller is authorized as either agency staff of that org OR a contact of the
 * company (source of truth: client_contacts, exactly like the rest of the portal
 * — this is what a client's access actually hangs on). Returns null otherwise.
 */
export async function resolveAssetAccess(
  clientCompanyId: string,
): Promise<AssetAccess | null> {
  const user = await requireUser();

  const service = createSupabaseServiceClient();
  const { data: company } = await service
    .from('client_companies')
    .select('organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!company) return null;

  // Agency staff of the company's organization.
  if (
    hasAgencyAccess(user) &&
    user.memberships.some((m) => m.organizationId === company.organization_id)
  ) {
    return { orgId: company.organization_id, isAgency: true };
  }

  // Client contact of this company (RLS-scoped: a user only sees their own rows).
  const supabase = await createSupabaseServerClient();
  const { data: contact } = await supabase
    .from('client_contacts')
    .select('id')
    .eq('client_company_id', clientCompanyId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (contact) return { orgId: company.organization_id, isAgency: false };

  return null;
}
