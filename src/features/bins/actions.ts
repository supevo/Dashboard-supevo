'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { isOrgAdmin } from '@/lib/authz/policies';
import { awardChoreXp } from '@/features/gamification/xp';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { parseBinIcs } from '@/features/bins/ics';
import { listMyOpenBinTasks, type OpenBinTask } from '@/features/bins/queries';

/** Offene Mülltonnen-Aufgaben des aktuellen Nutzers (für die Clock-out-UI). */
export async function getMyOpenBinTasksAction(): Promise<OpenBinTask[]> {
  const user = await requireUser();
  return listMyOpenBinTasks(user.id);
}

/**
 * Admin lädt die aktuelle ICS hoch. Ersetzt die künftigen Abfuhrtermine der Org
 * und aktualisiert die Kalender-Meta (Reichweite). Vergangene Termine bleiben.
 */
export async function uploadBinIcsAction(input: {
  filename: string;
  content: string;
}): Promise<ActionResult> {
  const parsed = z
    .object({ filename: z.string().max(260), content: z.string().min(20).max(2_000_000) })
    .safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) return errorResult(de.errors.FORBIDDEN);

  const pickups = parseBinIcs(parsed.data.content);
  if (pickups.length === 0) {
    return errorResult('Keine Abfuhrtermine in der Datei gefunden.');
  }

  const today = new Date().toISOString().slice(0, 10);
  const service = createSupabaseServiceClient();

  // Künftige Termine ersetzen (Vergangenes für die Historie behalten).
  await service
    .from('bin_pickups')
    .delete()
    .eq('organization_id', orgId)
    .gte('pickup_date', today);

  const future = pickups.filter((p) => p.date >= today);
  if (future.length > 0) {
    const { error } = await service.from('bin_pickups').insert(
      future.map((p) => ({
        organization_id: orgId,
        bin_key: p.binKey,
        bin_label: p.binLabel,
        pickup_date: p.date,
      })) as never,
    );
    if (error) return errorResult(de.errors.INTERNAL);
  }

  const coverageEnd = pickups.reduce((max, p) => (p.date > max ? p.date : max), pickups[0]!.date);
  await service.from('bin_calendar_meta').upsert(
    {
      organization_id: orgId,
      filename: parsed.data.filename,
      uploaded_at: new Date().toISOString(),
      coverage_end: coverageEnd,
      low_notified_for: null,
    } as never,
    { onConflict: 'organization_id' },
  );

  revalidatePath('/app/settings');
  return successResult(
    `${future.length} Termine übernommen – Kalender reicht bis ${coverageEnd}.`,
  );
}

/** Nutzer erledigt eine zugeteilte Mülltonnen-Aufgabe. XP nur, wenn nicht missed. */
export async function completeBinTaskAction(assignmentId: string): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(assignmentId);
  if (!id.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  const service = createSupabaseServiceClient();
  const { data: a } = await service
    .from('bin_task_assignments')
    .select('id, organization_id, assignee_id, status')
    .eq('id', id.data)
    .maybeSingle();
  const row = a as {
    id: string;
    organization_id: string;
    assignee_id: string;
    status: string;
  } | null;
  if (!row || row.assignee_id !== user.id || !['assigned', 'missed'].includes(row.status)) {
    return errorResult(de.errors.FORBIDDEN);
  }

  const wasMissed = row.status === 'missed';
  await service
    .from('bin_task_assignments')
    .update({ status: 'done', done_at: new Date().toISOString() } as never)
    .eq('id', row.id);

  // XP nur für fristgerecht erledigte Aufgaben (nicht bei Nachhol-„missed").
  if (!wasMissed) {
    await awardChoreXp({
      orgId: row.organization_id,
      assignmentId: row.id,
      doerId: user.id,
      verifierId: null,
    }).catch(() => {});
  }

  revalidatePath('/app/time');
  return successResult(wasMissed ? 'Nachgeholt – danke!' : 'Erledigt – danke!');
}
