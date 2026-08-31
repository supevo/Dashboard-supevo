import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { rechtsformInfo } from '@/features/accounting/constants';
import {
  computeEuer,
  computeUst,
  type EuerTx,
  type EuerResult,
  type EuerLine,
  type UstResult,
} from '@/features/accounting/tax/euer-ust';
import {
  estimateTaxes,
  type TaxEstimate,
} from '@/features/accounting/tax/estimate';
import { logger } from '@/lib/logger';

export interface TaxOverview {
  year: number;
  euer: EuerResult;
  ust: UstResult;
  estimate: TaxEstimate;
  profileMissing: boolean;
  rechtsformLabel: string;
  kleinunternehmer: boolean;
}

/**
 * Loads a company's categorized transactions for one calendar year and computes
 * EÜR, USt-Voranmeldung (year sum) and the tax estimate from its accounting
 * profile. Cash-basis: the bank transactions are the source.
 */
export async function getTaxOverview(
  billingEntityId: string,
  year: number,
  month = 0,
): Promise<TaxOverview> {
  const supabase = await createSupabaseServerClient();

  const { data: profile } = await supabase
    .from('accounting_profiles')
    .select(
      'rechtsform, hebesatz, splitting, kirchensteuer, kleinunternehmer, weitere_einkuenfte_cents',
    )
    .eq('billing_entity_id', billingEntityId)
    .maybeSingle();

  const info = rechtsformInfo(profile?.rechtsform);
  const kleinunternehmer = profile?.kleinunternehmer ?? false;

  // month 1–12 → just that month; 0 → whole year.
  const mm = month >= 1 && month <= 12 ? String(month).padStart(2, '0') : null;
  const from = mm ? `${year}-${mm}-01` : `${year}-01-01`;
  const to = mm
    ? `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
    : `${year}-12-31`;
  const { data: rows } = await supabase
    .from('bookkeeping_transactions')
    .select('betrag_cents, kategorie_id, privatanteil')
    .eq('billing_entity_id', billingEntityId)
    .gte('datum', from)
    .lte('datum', to)
    .limit(20000);

  const txs: EuerTx[] = (rows ?? []).map((t) => ({
    betragCents: t.betrag_cents,
    kategorieId: t.kategorie_id,
    privatanteil: t.privatanteil ?? 0,
  }));

  const euer = computeEuer(txs);
  const ust = computeUst(txs, kleinunternehmer);
  const estimate = estimateTaxes({
    gewinnCents: euer.gewinnCents,
    rechtsform: info,
    hebesatzPct: profile?.hebesatz ?? null,
    splitting: profile?.splitting ?? false,
    kirchensteuer: profile?.kirchensteuer ?? false,
    weitereEinkuenfteCents: profile?.weitere_einkuenfte_cents ?? 0,
    ustZahllastCents: ust.zahllastCents,
  });

  return {
    year,
    euer,
    ust,
    estimate,
    profileMissing: !profile,
    rechtsformLabel: info.label,
    kleinunternehmer,
  };
}

/** A zeroed overview, used when a company's calculation fails (never crash). */
function emptyOverview(year: number): TaxOverview {
  return {
    year,
    euer: {
      einnahmen: [],
      ausgaben: [],
      einnahmenNettoCents: 0,
      ausgabenNettoCents: 0,
      gewinnCents: 0,
      unkategorisiert: 0,
    },
    ust: {
      kleinunternehmer: false,
      umsatz19NettoCents: 0,
      ust19Cents: 0,
      umsatz7NettoCents: 0,
      ust7Cents: 0,
      vorsteuerCents: 0,
      zahllastCents: 0,
    },
    estimate: {
      lines: [],
      ertragsteuerCents: 0,
      gewerbesteuerCents: 0,
      offeneUstCents: 0,
      ruecklageCents: 0,
    },
    profileMissing: true,
    rechtsformLabel: '—',
    kleinunternehmer: false,
  };
}

/**
 * Crash-safe wrapper: a broken calculation for one company must never take down
 * the whole (especially consolidated) Steuer view. Logs and returns a zeroed
 * overview instead.
 */
export async function getTaxOverviewSafe(
  billingEntityId: string,
  year: number,
  month = 0,
): Promise<TaxOverview> {
  try {
    return await getTaxOverview(billingEntityId, year, month);
  } catch (e) {
    logger.error('[tax] getTaxOverview failed', {
      billingEntityId,
      year,
      error: e instanceof Error ? e.message : String(e),
    });
    return emptyOverview(year);
  }
}

function mergeLines(lists: EuerLine[][]): EuerLine[] {
  const m = new Map<string, EuerLine>();
  for (const list of lists) {
    for (const l of list) {
      const ex = m.get(l.kategorieId);
      if (ex) ex.nettoCents += l.nettoCents;
      else m.set(l.kategorieId, { ...l });
    }
  }
  return [...m.values()].sort((a, b) => b.nettoCents - a.nettoCents);
}

/**
 * Consolidated view over several companies: EÜR and USt are summed; the tax
 * estimate is the SUM of each company's individually correct estimate (each
 * legal form is computed on its own – not merged into one). estimate.lines is
 * left empty for the combined case; the caller shows a per-company breakdown.
 */
export function aggregateTaxOverviews(list: TaxOverview[]): TaxOverview {
  const einnahmen = mergeLines(list.map((o) => o.euer.einnahmen));
  const ausgaben = mergeLines(list.map((o) => o.euer.ausgaben));
  const sum = (f: (o: TaxOverview) => number): number =>
    list.reduce((s, o) => s + f(o), 0);

  return {
    year: list[0]?.year ?? new Date().getFullYear(),
    euer: {
      einnahmen,
      ausgaben,
      einnahmenNettoCents: sum((o) => o.euer.einnahmenNettoCents),
      ausgabenNettoCents: sum((o) => o.euer.ausgabenNettoCents),
      gewinnCents: sum((o) => o.euer.gewinnCents),
      unkategorisiert: sum((o) => o.euer.unkategorisiert),
    },
    ust: {
      kleinunternehmer: false,
      umsatz19NettoCents: sum((o) => o.ust.umsatz19NettoCents),
      ust19Cents: sum((o) => o.ust.ust19Cents),
      umsatz7NettoCents: sum((o) => o.ust.umsatz7NettoCents),
      ust7Cents: sum((o) => o.ust.ust7Cents),
      vorsteuerCents: sum((o) => o.ust.vorsteuerCents),
      zahllastCents: sum((o) => o.ust.zahllastCents),
    },
    estimate: {
      lines: [],
      ertragsteuerCents: sum((o) => o.estimate.ertragsteuerCents),
      gewerbesteuerCents: sum((o) => o.estimate.gewerbesteuerCents),
      offeneUstCents: sum((o) => o.estimate.offeneUstCents),
      ruecklageCents: sum((o) => o.estimate.ruecklageCents),
    },
    profileMissing: false,
    rechtsformLabel: 'Alle Firmen zusammen',
    kleinunternehmer: false,
  };
}
