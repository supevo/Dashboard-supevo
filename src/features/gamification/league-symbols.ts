import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** The org's custom league symbols as { league_key: symbol }. RLS-scoped. */
export async function getLeagueSymbols(
  orgId: string,
): Promise<Record<string, string>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('league_symbols')
    .select('league_key, symbol')
    .eq('organization_id', orgId);
  const out: Record<string, string> = {};
  for (const row of data ?? []) out[row.league_key] = row.symbol;
  return out;
}
