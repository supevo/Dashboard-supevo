import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser, authorize } from '@/lib/authz/authorize';
import type { AppRole } from '@/lib/authz/roles';
import type { MembershipStatus } from '@/lib/database.types';

export interface OrgMember {
  membershipId: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  role: AppRole;
  status: MembershipStatus;
  isSelf: boolean;
}

/**
 * Lists the members of an organization. Guarded by `member.list`; the
 * privileged service client is used only AFTER the authorization check, to
 * join profile data (names/emails) that is not otherwise readable.
 */
export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const user = await requireUser();
  authorize(user, { type: 'member.list', orgId });

  const service = createSupabaseServiceClient();
  const { data: memberships } = await service
    .from('memberships')
    .select('id, user_id, role, status')
    .eq('organization_id', orgId);

  if (!memberships || memberships.length === 0) return [];

  const userIds = memberships.map((m) => m.user_id);
  const { data: profiles } = await service
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds);

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id, p] as const),
  );

  return memberships
    .map((m) => {
      const profile = profileById.get(m.user_id);
      return {
        membershipId: m.id,
        userId: m.user_id,
        fullName: profile?.full_name ?? null,
        email: profile?.email ?? null,
        role: m.role,
        status: m.status,
        isSelf: m.user_id === user.id,
      };
    })
    .sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));
}
