import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { formatEuroCents } from '@/lib/money';

export interface OfferCarryover {
  promotions: { id: string; title: string; discountText: string }[];
  adsCreditCents: number;
  adsCreditRedeemedAt: string | null;
}

/**
 * Angebots-Extras, die aus dem Lead in die Mitgliedschaft übernommen wurden:
 * eingelöste Gutscheine und das einmalige Google-Ads-Guthaben (inkl. Einlöse-
 * status). Service-Client; der Aufrufer muss Zugriff auf den Kunden haben
 * (Agentur-Seite bzw. das eigene Kundenkonto im Portal).
 */
export async function getOfferCarryover(
  clientCompanyId: string,
): Promise<OfferCarryover> {
  const empty: OfferCarryover = {
    promotions: [],
    adsCreditCents: 0,
    adsCreditRedeemedAt: null,
  };
  const service = createSupabaseServiceClient();
  const { data: m } = await service
    .from('client_memberships')
    .select('redeemed_promotions, ads_credit_cents, ads_credit_redeemed_at')
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();
  if (!m) return empty;

  const ids = Array.isArray(m.redeemed_promotions)
    ? (m.redeemed_promotions as string[])
    : [];
  let promotions: OfferCarryover['promotions'] = [];
  if (ids.length > 0) {
    const { data: promos } = await service
      .from('promotions')
      .select('id, title, discount_kind, discount_value')
      .in('id', ids);
    promotions = (promos ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      discountText:
        p.discount_kind === 'percent'
          ? `${p.discount_value}%`
          : p.discount_kind === 'fixed'
            ? formatEuroCents(p.discount_value)
            : '',
    }));
  }

  return {
    promotions,
    adsCreditCents: m.ads_credit_cents ?? 0,
    adsCreditRedeemedAt: m.ads_credit_redeemed_at ?? null,
  };
}
