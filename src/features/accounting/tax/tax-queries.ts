import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { rechtsformInfo } from '@/features/accounting/constants';
import {
  computeEuer,
  computeUst,
  type EuerTx,
  type EuerResult,
  type UstResult,
} from '@/features/accounting/tax/euer-ust';
import {
  estimateTaxes,
  type TaxEstimate,
} from '@/features/accounting/tax/estimate';

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

  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
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
