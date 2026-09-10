import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export type AdsPlatform = 'meta' | 'google';

export interface AdsMandate {
  id: string;
  clientCompanyId: string;
  clientName: string | null;
  platform: AdsPlatform;
  monthlyFeeCents: number | null;
  responsibleUserId: string | null;
  active: boolean;
}

/** Eine Monatszeile je Mandat: verbrauchtes Budget + „abgerechnet". */
export interface AdsMonthRow extends AdsMandate {
  entryId: string | null;
  spentCents: number | null;
  billed: boolean;
}

function monthStr(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** Kontext für die „Ads-Abrechnung"-Karte einer Aufgabe. */
export async function getTaskAdsContext(taskId: string): Promise<{
  status: string | null;
  clientCompanyId: string | null;
  mandates: { platform: AdsPlatform; active: boolean }[];
}> {
  const supabase = await createSupabaseServerClient();
  const { data: task } = await supabase
    .from('tasks')
    .select('ads_billing_status, project_id')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return { status: null, clientCompanyId: null, mandates: [] };

  const { data: project } = await supabase
    .from('projects')
    .select('client_company_id')
    .eq('id', task.project_id)
    .maybeSingle();
  const clientCompanyId = project?.client_company_id ?? null;

  let mandates: { platform: AdsPlatform; active: boolean }[] = [];
  if (clientCompanyId) {
    const { data } = await supabase
      .from('ads_mandates')
      .select('platform, active')
      .eq('client_company_id', clientCompanyId);
    mandates = (data ?? []).map((m) => ({
      platform: m.platform as AdsPlatform,
      active: m.active,
    }));
  }
  return {
    status: (task as { ads_billing_status: string | null }).ads_billing_status,
    clientCompanyId,
    mandates,
  };
}

/** Alle Ads-Mandate der Organisation (für den Monatsboard/die Übersicht). */
export async function listAdsMandates(orgId: string): Promise<AdsMandate[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('ads_mandates')
    .select(
      'id, client_company_id, platform, monthly_fee_cents, responsible_user_id, active',
    )
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true });
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const clientIds = [...new Set(rows.map((r) => r.client_company_id))];
  const service = createSupabaseServiceClient();
  const { data: clients } = await service
    .from('client_companies')
    .select('id, name')
    .in('id', clientIds);
  const nameById = new Map((clients ?? []).map((c) => [c.id, c.name]));

  return rows.map((r) => ({
    id: r.id,
    clientCompanyId: r.client_company_id,
    clientName: nameById.get(r.client_company_id) ?? null,
    platform: r.platform as AdsPlatform,
    monthlyFeeCents: r.monthly_fee_cents,
    responsibleUserId: r.responsible_user_id,
    active: r.active,
  }));
}

/**
 * Monatsboard: jede aktive Mandatszeile mit der Erfassung des gewählten Monats
 * (verbrauchtes Budget + abgerechnet). Zeilen ohne Eintrag sind „offen".
 */
export async function getAdsMonthlyBoard(
  orgId: string,
  year: number,
  month: number,
): Promise<AdsMonthRow[]> {
  const mandates = await listAdsMandates(orgId);
  const active = mandates.filter((m) => m.active);
  if (active.length === 0) return [];

  const supabase = await createSupabaseServerClient();
  const { data: entries } = await supabase
    .from('ads_monthly_entries')
    .select('id, mandate_id, spent_cents, billed')
    .eq('month', monthStr(year, month))
    .in(
      'mandate_id',
      active.map((m) => m.id),
    );
  const byMandate = new Map(
    (entries ?? []).map((e) => [e.mandate_id, e] as const),
  );

  return active.map((m) => {
    const e = byMandate.get(m.id);
    return {
      ...m,
      entryId: e?.id ?? null,
      spentCents: e?.spent_cents ?? null,
      billed: e?.billed ?? false,
    };
  });
}
