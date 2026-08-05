import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface LeagueSymbolOverride {
  symbol: string | null;
  hasImage: boolean;
}

/** The org's custom league symbols keyed by league_key. RLS-scoped. */
export async function getLeagueSymbols(
  orgId: string,
): Promise<Record<string, LeagueSymbolOverride>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('league_symbols')
    .select('league_key, symbol, image_path')
    .eq('organization_id', orgId);
  const out: Record<string, LeagueSymbolOverride> = {};
  for (const row of data ?? []) {
    out[row.league_key] = { symbol: row.symbol, hasImage: Boolean(row.image_path) };
  }
  return out;
}
