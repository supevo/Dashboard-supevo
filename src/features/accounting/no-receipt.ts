import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Lädt die „kein Beleg nötig"-Gründe je Transaktions-ID. Fehlt die Spalte noch
 * (Migration 0194 nicht eingespielt), wird eine leere Map zurückgegeben – so
 * bricht die Finanz-Übersicht bzw. der Export nicht, wenn die Migration lahmt.
 */
export async function getNoReceiptReasons(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  try {
    const { data, error } = await supabase
      .from('bookkeeping_transactions')
      .select('id, beleg_nicht_noetig_grund')
      .in('id', ids);
    if (error) return map;
    for (const r of (data ?? []) as {
      id: string;
      beleg_nicht_noetig_grund: string | null;
    }[]) {
      if (r.beleg_nicht_noetig_grund) map.set(r.id, r.beleg_nicht_noetig_grund);
    }
  } catch {
    /* Spalte evtl. noch nicht migriert – Grund bleibt leer. */
  }
  return map;
}
