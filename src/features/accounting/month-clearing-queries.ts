import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { kategorie, kategorieLabel } from '@/features/accounting/categories';
import { getNoReceiptReasons } from '@/features/accounting/no-receipt';

export type ClearingStatus =
  | 'ok' // Beleg vorhanden
  | 'none' // kein Beleg nötig (mit Grund)
  | 'none_no_reason' // als „kein Beleg" markiert, Grund fehlt
  | 'missing' // Beleg fehlt (Ausgabe, kein Dauerbeleg)
  | 'not_needed'; // kein Beleg erforderlich (Einnahme / Dauerbeleg)

export interface ClearingRow {
  id: string;
  datum: string;
  gegen: string | null;
  zweck: string | null;
  betragCents: number;
  art: 'Einnahme' | 'Ausgabe';
  kategorieId: string | null;
  kategorieLabel: string;
  status: ClearingStatus;
  belegFile: string | null;
  reason: string | null;
}

export interface MonthClearing {
  year: number;
  month: number;
  rows: ClearingRow[];
  summary: {
    total: number;
    geklaert: number; // ok + none + not_needed
    offen: number; // missing + none_no_reason
    missing: number;
    noReason: number;
  };
}

interface TxRow {
  id: string;
  datum: string;
  gegen: string | null;
  zweck: string | null;
  betrag_cents: number;
  kategorie_id: string | null;
  beleg_id: string | null;
  beleg_nicht_noetig: boolean;
}

/**
 * Eine Monatsliste, verankert am Kontoauszug: jede Bankbuchung des Monats mit
 * ihrem Beleg-Status (vorhanden / fehlt / kein Beleg nötig). Führt Kontoauszug,
 * Belege und Zuordnung in EINER Liste zusammen (statt vier Reitern).
 */
export async function getMonthClearing(
  billingEntityId: string,
  year: number,
  month: number,
): Promise<MonthClearing> {
  const supabase = await createSupabaseServerClient();
  const mm = String(month).padStart(2, '0');
  const last = new Date(year, month, 0).getDate();

  const { data } = await supabase
    .from('bookkeeping_transactions')
    .select(
      'id, datum, gegen, zweck, betrag_cents, kategorie_id, beleg_id, beleg_nicht_noetig',
    )
    .eq('billing_entity_id', billingEntityId)
    .gte('datum', `${year}-${mm}-01`)
    .lte('datum', `${year}-${mm}-${String(last).padStart(2, '0')}`)
    .order('datum', { ascending: false })
    .limit(5000);
  const txns = (data ?? []) as TxRow[];

  // Beleg-Dateinamen der zugeordneten Belege nachladen.
  const belegIds = [
    ...new Set(txns.map((t) => t.beleg_id).filter((x): x is string => !!x)),
  ];
  const belegFileById = new Map<string, string>();
  if (belegIds.length > 0) {
    const { data: belege } = await supabase
      .from('bookkeeping_receipts')
      .select('id, file_name')
      .in('id', belegIds);
    for (const b of belege ?? []) belegFileById.set(b.id, b.file_name ?? '');
  }

  // Gründe für „kein Beleg nötig" (resilient, falls Migration 0194 noch fehlt).
  const reasonById = await getNoReceiptReasons(
    supabase,
    txns.filter((t) => t.beleg_nicht_noetig).map((t) => t.id),
  );

  const rows: ClearingRow[] = txns.map((t) => {
    const kat = kategorie(t.kategorie_id);
    const art: ClearingRow['art'] =
      kat?.art === 'einnahme'
        ? 'Einnahme'
        : kat?.art === 'ausgabe'
          ? 'Ausgabe'
          : t.betrag_cents >= 0
            ? 'Einnahme'
            : 'Ausgabe';

    let status: ClearingStatus;
    let reason: string | null = null;
    const belegFile = t.beleg_id ? (belegFileById.get(t.beleg_id) ?? '') : null;

    if (t.beleg_id) {
      status = 'ok';
    } else if (t.beleg_nicht_noetig) {
      reason = reasonById.get(t.id) ?? '';
      status = reason ? 'none' : 'none_no_reason';
    } else if (kat && kat.art === 'ausgabe' && !kat.dauerbeleg) {
      status = 'missing';
    } else {
      status = 'not_needed';
    }

    return {
      id: t.id,
      datum: t.datum,
      gegen: t.gegen,
      zweck: t.zweck,
      betragCents: t.betrag_cents,
      art,
      kategorieId: t.kategorie_id,
      kategorieLabel: t.kategorie_id ? kategorieLabel(t.kategorie_id) : '',
      status,
      belegFile: belegFile || null,
      reason,
    };
  });

  const missing = rows.filter((r) => r.status === 'missing').length;
  const noReason = rows.filter((r) => r.status === 'none_no_reason').length;
  const geklaert = rows.filter(
    (r) => r.status === 'ok' || r.status === 'none' || r.status === 'not_needed',
  ).length;

  return {
    year,
    month,
    rows,
    summary: {
      total: rows.length,
      geklaert,
      offen: missing + noReason,
      missing,
      noReason,
    },
  };
}

export interface ReceiptSearchHit {
  id: string;
  fileName: string;
  haendler: string | null;
  bruttoCents: number | null;
  datum: string | null;
}
