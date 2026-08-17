import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export type DiscountKind = 'none' | 'fixed' | 'percent';

export interface Promotion {
  id: string;
  title: string;
  conditions: string;
  icon: string | null;
  validUntil: string | null;
  /** Einlösbarer Gutschein-Wert: fester Betrag (Cent) oder Prozent-Rabatt. */
  discountKind: DiscountKind;
  discountValue: number;
  position: number;
  active: boolean;
}

const SELECT =
  'id, title, conditions, icon, valid_until, discount_kind, discount_value, position, active';

interface Row {
  id: string;
  title: string;
  conditions: string | null;
  icon: string | null;
  valid_until: string | null;
  discount_kind: DiscountKind | null;
  discount_value: number | null;
  position: number;
  active: boolean;
}

function mapRow(r: Row): Promotion {
  return {
    id: r.id,
    title: r.title,
    conditions: r.conditions ?? '',
    icon: r.icon,
    validUntil: r.valid_until,
    discountKind: r.discount_kind ?? 'none',
    discountValue: r.discount_value ?? 0,
    position: r.position,
    active: r.active,
  };
}

/** Alle Promotions (inkl. inaktiver) fürs Backend – RLS: nur Org-Admin. */
export async function getAdminPromotions(orgId: string): Promise<Promotion[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('promotions')
    .select(SELECT)
    .eq('organization_id', orgId)
    .order('position', { ascending: true });
  return (data as Row[] | null ?? []).map(mapRow);
}

/**
 * Aktive, noch gültige Promotions – für die Anzeige (z. B. im Onboarding).
 * Service-Client, damit auch Portal-Kunden sie lesen können; Schreiben bleibt
 * über RLS admin-only.
 */
export async function getActivePromotions(orgId: string): Promise<Promotion[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await createSupabaseServiceClient()
    .from('promotions')
    .select(SELECT)
    .eq('organization_id', orgId)
    .eq('active', true)
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .order('position', { ascending: true });
  return (data as Row[] | null ?? []).map(mapRow);
}
