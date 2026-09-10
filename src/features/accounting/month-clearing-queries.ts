import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { kategorie, kategorieLabel } from '@/features/accounting/categories';
import { getNoReceiptReasons } from '@/features/accounting/no-receipt';
import { getReconcileSuggestions } from '@/features/accounting/reconcile-queries';
import { matchesCreditor } from '@/features/accounting/reconcile';
import {
  getCategoryRuleMap,
  normalizeMatchKey,
} from '@/features/accounting/category-rules';
import { getNoReceiptRuleMap } from '@/features/accounting/no-receipt-rules';
import { formatEuroCents } from '@/lib/money';

export interface ClearingSuggestion {
  receiptId: string;
  fileName: string;
  /** Kurzlabel: Händler · Betrag · Datum. */
  label: string;
  /** Warum das passt (z. B. „Betrag exakt, Händlername im Zweck"). */
  reason: string;
  scorePct: number;
}

export type ClearingStatus =
  | 'ok' // Beleg vorhanden
  | 'none' // kein Beleg nötig (mit Grund)
  | 'none_no_reason' // als „kein Beleg" markiert, Grund fehlt
  | 'missing' // Beleg fehlt (Ausgabe, kein Dauerbeleg)
  | 'creditor' // über Kreditorenkonto (z. B. Google) – kein Einzelbeleg
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
  /** Automatische Beleg-Vorschläge (nur bei „Beleg fehlt"), bester zuerst. */
  suggestions: ClearingSuggestion[];
  /** Gelernt: dieser Empfänger war früher „kein Beleg nötig" (Grund) – Vorschlag. */
  learnedReason: string | null;
  /** Gelernt: frühere Kategorie dieses Empfängers (nur wenn noch nicht kategorisiert). */
  learnedKategorieId: string | null;
  learnedKategorieLabel: string;
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

  // Kreditoren (z. B. Google): deren Buchungen laufen übers Kreditorenkonto und
  // brauchen keinen Einzelbeleg – nicht als „Beleg fehlt" anmahnen.
  const { data: profile } = await supabase
    .from('accounting_profiles')
    .select('kreditoren')
    .eq('billing_entity_id', billingEntityId)
    .maybeSingle();
  const creditors =
    (profile as { kreditoren?: string[] } | null)?.kreditoren ?? [];

  // Gelerntes: Empfänger → frühere Kategorie bzw. „kein Beleg nötig"-Grund.
  // Wird als Ein-Klick-Vorschlag angeboten (nicht automatisch übernommen).
  const [categoryRules, noReceiptRules] = await Promise.all([
    getCategoryRuleMap(supabase, billingEntityId),
    getNoReceiptRuleMap(supabase, billingEntityId),
  ]);

  // Automatische Beleg-Vorschläge vom Abgleich-Motor (Betrag + Datum +
  // Händler/Nummer im Verwendungszweck, inkl. PayPal-Intermediär). Pro Umsatz
  // die besten Treffer. Optional – Fehler dürfen die Liste nie blockieren.
  const suggByTx = new Map<string, ClearingSuggestion[]>();
  try {
    const sugg = await getReconcileSuggestions(billingEntityId);
    const raw = new Map<
      string,
      {
        receiptId: string;
        score: number;
        reason: string;
        haendler: string | null;
        brutto: number | null;
        datum: string | null;
      }[]
    >();
    for (const s of sugg.receipts) {
      const txId = s.match.rightId; // leftId=Beleg, rightId=Umsatz
      const arr = raw.get(txId) ?? [];
      arr.push({
        receiptId: s.match.leftId,
        score: s.match.score,
        reason: s.match.reason,
        haendler: s.receiptHaendler,
        brutto: s.receiptBruttoCents,
        datum: s.receiptDatum,
      });
      raw.set(txId, arr);
    }
    const suggIds = [...new Set([...raw.values()].flat().map((x) => x.receiptId))];
    const nameById = new Map<string, string>();
    if (suggIds.length > 0) {
      const { data: sr } = await supabase
        .from('bookkeeping_receipts')
        .select('id, file_name')
        .in('id', suggIds);
      for (const r of sr ?? []) nameById.set(r.id, r.file_name ?? '');
    }
    for (const [txId, arr] of raw) {
      arr.sort((a, b) => b.score - a.score);
      suggByTx.set(
        txId,
        arr.slice(0, 3).map((x) => ({
          receiptId: x.receiptId,
          fileName: nameById.get(x.receiptId) || '(Beleg)',
          label: [
            x.haendler,
            x.datum ? new Date(x.datum).toLocaleDateString('de-DE') : null,
            x.brutto != null ? formatEuroCents(Math.abs(x.brutto)) : null,
          ]
            .filter(Boolean)
            .join(' · '),
          reason: x.reason,
          scorePct: Math.round(x.score * 100),
        })),
      );
    }
  } catch {
    /* Vorschläge sind optional. */
  }

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
    } else if (t.betrag_cents < 0 && matchesCreditor(t.gegen, creditors)) {
      status = 'creditor';
    } else if (
      (kat && kat.art === 'ausgabe' && !kat.dauerbeleg) ||
      // Unkategorisierte Ausgaben brauchen Aufmerksamkeit (nicht stumm „nicht nötig").
      (!kat && t.betrag_cents < 0)
    ) {
      status = 'missing';
    } else {
      status = 'not_needed';
    }

    // Gelernte Vorschläge für diesen Empfänger (nur wo sie etwas bringen).
    const key = normalizeMatchKey(t.gegen);
    const learnedReason =
      key && (status === 'missing' || status === 'none_no_reason')
        ? (noReceiptRules.get(key) ?? null)
        : null;
    const learnedKategorieId =
      key && !t.kategorie_id ? (categoryRules.get(key) ?? null) : null;

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
      suggestions: status === 'missing' ? (suggByTx.get(t.id) ?? []) : [],
      learnedReason,
      learnedKategorieId,
      learnedKategorieLabel: learnedKategorieId
        ? kategorieLabel(learnedKategorieId)
        : '',
    };
  });

  const missing = rows.filter((r) => r.status === 'missing').length;
  const noReason = rows.filter((r) => r.status === 'none_no_reason').length;
  const geklaert = rows.filter(
    (r) =>
      r.status === 'ok' ||
      r.status === 'none' ||
      r.status === 'not_needed' ||
      r.status === 'creditor',
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

/** Ein Eintrag beim Durchblättern der OneDrive-Ordner (Ordner oder Datei). */
export interface OneDriveEntry {
  id: string;
  name: string;
  isFolder: boolean;
  /** Nur an den Wurzel-Einträgen gesetzt: Beleg-Art des Ordners. */
  kind?: 'einnahmen' | 'ausgaben';
}
