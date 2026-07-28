'use server';

import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { isOrgAdmin } from '@/lib/authz/policies';
import { isAiEnabled } from '@/lib/ai/complete';
import { getCockpit } from '@/features/cockpit/queries';
import { bumpCounter } from '@/features/gamification/actions';
import { generateCoaching, generateEscalation } from './generate';

export interface CoachingResult {
  enabled: boolean;
  text: string | null;
}

/** The current employee's own KI coaching message for this week. */
export async function getMyCoaching(): Promise<CoachingResult> {
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return { enabled: true, text: null };
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isAiEnabled()) return { enabled: false, text: null };

  const rows = await getCockpit(orgId);
  const mine = rows.find((r) => r.userId === user.id);
  if (!mine) return { enabled: true, text: null };
  const text = await generateCoaching(mine);
  // Collectible badge "Ich liebe dich Coach": count AI feedback pulls.
  if (text) await bumpCounter('ai_feedback');
  return { enabled: true, text };
}

/** Leadership escalation across the team (org admins only). */
export async function getTeamEscalation(): Promise<CoachingResult> {
  const user = await requireUser();
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) return { enabled: true, text: null };
  if (!isAiEnabled()) return { enabled: false, text: null };

  const rows = await getCockpit(orgId);
  const text = await generateEscalation(rows);
  return { enabled: true, text };
}
