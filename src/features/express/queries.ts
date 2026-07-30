import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { berlinToday } from '@/lib/time';

export interface ExpressStatus {
  /** Tickets granted per calendar month (from membership stage, or admin override). */
  perMonth: number;
  /** Tickets already redeemed in the current period. */
  used: number;
  /** Tickets still available this period (perMonth − used, floored at 0). */
  available: number;
  /** Current period as 'YYYY-MM' (Europe/Berlin). */
  period: string;
}

/** Current-month period key ('YYYY-MM', Europe/Berlin). */
export function currentExpressPeriod(): string {
  return berlinToday().slice(0, 7);
}

/**
 * Tickets a client gets per month: derived from their membership stage
 * (Stage 1 → 1, Stage 2 → 2). An admin override on the client company
 * (express_tickets_per_month > 0) takes precedence for special arrangements.
 */
function ticketsPerMonth(
  stage: number | null | undefined,
  override: number,
): number {
  if (override > 0) return override;
  if (stage === 2) return 2;
  if (stage === 1) return 1;
  return 0;
}

/**
 * Express-Ticket contingent for a client company in the current month. Reads via
 * the caller's RLS-scoped client so a client only ever sees their own company.
 */
export async function getExpressStatus(
  clientCompanyId: string,
): Promise<ExpressStatus> {
  const period = currentExpressPeriod();
  const supabase = await createSupabaseServerClient();
  // The redemptions table has RLS enabled but no SELECT policy, so counting via
  // the caller's client always returned 0 (limit never hit). Count via the
  // service client instead.
  const service = createSupabaseServiceClient();

  const [{ data: company }, { data: membership }, { count }] = await Promise.all([
    supabase
      .from('client_companies')
      .select('express_tickets_per_month')
      .eq('id', clientCompanyId)
      .maybeSingle(),
    supabase
      .from('client_memberships')
      .select('stage')
      .eq('client_company_id', clientCompanyId)
      .maybeSingle(),
    service
      .from('express_ticket_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('client_company_id', clientCompanyId)
      .eq('period', period),
  ]);

  const perMonth = ticketsPerMonth(
    membership?.stage,
    company?.express_tickets_per_month ?? 0,
  );
  const used = count ?? 0;
  return {
    perMonth,
    used,
    available: Math.max(0, perMonth - used),
    period,
  };
}
