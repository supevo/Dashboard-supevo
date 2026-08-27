import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { berlinToday } from '@/lib/time';

/** First day of the current month (YYYY-MM-01), Berlin-based. */
export function currentMonthStart(): string {
  return `${berlinToday().slice(0, 7)}-01`;
}

export interface MySatisfaction {
  rating: number;
  comment: string | null;
}

/** The current client's rating for this month (for the portal widget). */
export async function getMySatisfaction(
  clientCompanyId: string,
): Promise<MySatisfaction | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('client_satisfaction')
    .select('rating, comment')
    .eq('client_company_id', clientCompanyId)
    .eq('month', currentMonthStart())
    .maybeSingle();
  return data ? { rating: data.rating, comment: data.comment } : null;
}

export interface SatisfactionSummary {
  average: number | null; // over the last 6 months
  count: number;
  latestRating: number | null;
  latestMonth: string | null;
  recent: { month: string; rating: number; comment: string | null }[];
}

/** Aggregate satisfaction for a client company (agency view). RLS-scoped. */
export async function getSatisfactionSummary(
  clientCompanyId: string,
): Promise<SatisfactionSummary> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('client_satisfaction')
    .select('month, rating, comment')
    .eq('client_company_id', clientCompanyId)
    .order('month', { ascending: false })
    .limit(6);

  const rows = data ?? [];
  if (rows.length === 0) {
    return { average: null, count: 0, latestRating: null, latestMonth: null, recent: [] };
  }
  const avg = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
  return {
    average: Math.round(avg * 10) / 10,
    count: rows.length,
    latestRating: rows[0]?.rating ?? null,
    latestMonth: rows[0]?.month ?? null,
    recent: rows.map((r) => ({ month: r.month, rating: r.rating, comment: r.comment })),
  };
}

/** Resolves the current user's client company + org (first membership). */
export const getMyClientCompany = cache(async function getMyClientCompany(): Promise<{
  clientCompanyId: string;
  organizationId: string;
  isLegacy: boolean;
} | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('client_contacts')
    .select('client_company_id, organization_id')
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const { data: company } = await supabase
    .from('client_companies')
    .select('is_legacy')
    .eq('id', data.client_company_id)
    .maybeSingle();
  return {
    clientCompanyId: data.client_company_id,
    organizationId: data.organization_id,
    isLegacy: company?.is_legacy ?? false,
  };
});
