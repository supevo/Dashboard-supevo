import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { berlinToday } from '@/lib/time';

export interface ExpressStatus {
  /** Tickets granted per calendar month (admin-set on the client company). */
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
 * Express-Ticket contingent for a client company in the current month. Reads via
 * the caller's RLS-scoped client so a client only ever sees their own company.
 */
export async function getExpressStatus(
  clientCompanyId: string,
): Promise<ExpressStatus> {
  const period = currentExpressPeriod();
  const supabase = await createSupabaseServerClient();

  const [{ data: company }, { count }] = await Promise.all([
    supabase
      .from('client_companies')
      .select('express_tickets_per_month')
      .eq('id', clientCompanyId)
      .maybeSingle(),
    supabase
      .from('express_ticket_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('client_company_id', clientCompanyId)
      .eq('period', period),
  ]);

  const perMonth = company?.express_tickets_per_month ?? 0;
  const used = count ?? 0;
  return {
    perMonth,
    used,
    available: Math.max(0, perMonth - used),
    period,
  };
}
