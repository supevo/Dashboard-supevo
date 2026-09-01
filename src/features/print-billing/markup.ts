import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Standard-Aufschlag auf die Druckerei-Rechnung (Prozent), wenn am Kunden kein
 * eigener Wert hinterlegt ist:
 *   - supevo-Mitgliedschaft (nicht-legacy, mit Mitgliedschaft) → 20 %
 *   - supevo Smart (is_legacy) bzw. ohne Mitgliedschaft        → 100 %
 */
export const DEFAULT_MARKUP_MEMBER_PERCENT = 20;
export const DEFAULT_MARKUP_OTHER_PERCENT = 100;

/**
 * Ermittelt den wirksamen Aufschlag (Prozent) für einen Kunden:
 *   1. expliziter Override am Kunden (print_markup_percent) hat Vorrang,
 *   2. sonst der Standard aus dem Programm (Mitgliedschaft → 20, sonst → 100).
 * Nutzt einen bereits erstellten Supabase-Client (Service oder RLS).
 */
export async function resolvePrintMarkupPercent(
  supabase: SupabaseClient,
  clientCompanyId: string,
): Promise<number> {
  // '*' + Cast, weil print_markup_percent (Migration 0173) noch nicht in den
  // generierten Typen steht (gleiches Muster wie bei attention_factor).
  const { data: company } = await supabase
    .from('client_companies')
    .select('*')
    .eq('id', clientCompanyId)
    .maybeSingle();
  const row = company as
    | { is_legacy?: boolean | null; print_markup_percent?: number | null }
    | null;

  const override = row?.print_markup_percent;
  if (override != null) return override;

  // is_legacy = „supevo Smart" → voller Aufschlag.
  if (row?.is_legacy) return DEFAULT_MARKUP_OTHER_PERCENT;

  // Nicht-legacy: nur mit echter supevo-Mitgliedschaft der vergünstigte Satz.
  const { data: membership } = await supabase
    .from('client_memberships')
    .select('id')
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();

  return membership
    ? DEFAULT_MARKUP_MEMBER_PERCENT
    : DEFAULT_MARKUP_OTHER_PERCENT;
}

/** Dem Kunden berechneter Betrag (Cent) = Druckerei-Brutto + Aufschlag. */
export function clientChargeCents(
  supplierGrossCents: number,
  markupPercent: number,
): number {
  return Math.round(supplierGrossCents * (1 + markupPercent / 100));
}
