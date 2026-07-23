import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { ActivityAction } from '@/lib/database.types';

interface AuditEntry {
  actorId: string;
  organizationId: string | null;
  action: ActivityAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Appends an entry to the activity_log. Written through the user client so the
 * RLS insert policy (actor_id = auth.uid()) applies. Failures are logged but
 * never block the primary action.
 */
export async function logActivity(entry: AuditEntry): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('activity_log').insert({
      actor_id: entry.actorId,
      organization_id: entry.organizationId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
    });
    if (error) {
      logger.warn('Audit-Eintrag fehlgeschlagen', {
        action: entry.action,
        entityType: entry.entityType,
      });
    }
  } catch (err) {
    logger.error('Audit-Logging-Ausnahme', {
      action: entry.action,
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}
