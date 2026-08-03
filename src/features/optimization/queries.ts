import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export type OptimizationCadence = 'off' | 'daily' | 'every_2_days' | 'weekly';

export interface OptimizationSettings {
  cadence: OptimizationCadence;
  autoApply: boolean;
  reassign: boolean;
  lastRunAt: string | null;
}

const DEFAULTS: OptimizationSettings = {
  cadence: 'off',
  autoApply: false,
  reassign: true,
  lastRunAt: null,
};

/** Reads the org's work-optimization settings (defaults when none saved). */
export async function getOptimizationSettings(
  orgId: string,
): Promise<OptimizationSettings> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('work_optimization_settings')
    .select('cadence, auto_apply, reassign, last_run_at')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!data) return DEFAULTS;
  return {
    cadence: (data.cadence as OptimizationCadence) ?? 'off',
    autoApply: data.auto_apply,
    reassign: data.reassign,
    lastRunAt: data.last_run_at,
  };
}
