import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';
import type { ClientMembership } from '@/features/billing/membership';

export interface PortalMembershipView {
  membership: ClientMembership;
  stage1Name: string;
  stage1Cents: number;
  stage2Name: string;
  stage2Cents: number;
  stage1Benefits: string[];
  stage2Benefits: string[];
  effectiveCents: number;
  isCustom: boolean;
}

/** Splits an admin-entered benefits text (one per line) into a clean list. */
function parseBenefits(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Loads the signed-in client's membership plus the two standard package prices
 * (read via the service client — clients may not read billing_settings, which
 * holds bank data — exposing ONLY the package names and prices).
 */
export async function getPortalMembership(): Promise<PortalMembershipView | null> {
  const supabase = await createSupabaseServerClient();
  const { data: membership } = await supabase
    .from('client_memberships')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  let stage1Name = 'Mitgliedschaft';
  let stage2Name = 'Mitgliedschaft Pro';
  let stage1Cents = 0;
  let stage2Cents = 0;
  let stage1Benefits: string[] = [];
  let stage2Benefits: string[] = [];
  try {
    const { data: s } = await createSupabaseServiceClient()
      .from('billing_settings')
      .select(
        'stage1_name, stage1_net_cents, stage2_name, stage2_net_cents, stage1_benefits, stage2_benefits',
      )
      .eq('organization_id', membership.organization_id)
      .maybeSingle();
    if (s) {
      stage1Name = s.stage1_name;
      stage1Cents = s.stage1_net_cents;
      stage2Name = s.stage2_name;
      stage2Cents = s.stage2_net_cents;
      stage1Benefits = parseBenefits(s.stage1_benefits);
      stage2Benefits = parseBenefits(s.stage2_benefits);
    }
  } catch (e) {
    logger.warn('portal.membership.prices_unavailable', {
      error: (e as Error).message,
    });
  }

  const isCustom = membership.custom_net_cents != null;
  const effectiveCents = isCustom
    ? (membership.custom_net_cents as number)
    : membership.stage === 2
      ? stage2Cents
      : stage1Cents;

  return {
    membership,
    stage1Name,
    stage1Cents,
    stage2Name,
    stage2Cents,
    stage1Benefits,
    stage2Benefits,
    effectiveCents,
    isCustom,
  };
}
