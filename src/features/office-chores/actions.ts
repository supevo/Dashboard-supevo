'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { isOrgAdmin } from '@/lib/authz/policies';
import { createNotifications } from '@/features/notifications/create';
import { awardChoreXp } from '@/features/gamification/xp';
import type { NotificationType } from '@/lib/database.types';
import { de } from '@/lib/i18n/de';
import { type ActionResult, errorResult, successResult } from '@/lib/action-result';
import { listMyOpenChores, type OpenChore } from './queries';

/** Loads the current user's open chores – used by the clock-out modal. */
export async function getMyOpenChoresAction(): Promise<OpenChore[]> {
  const user = await requireUser();
  return listMyOpenChores(user.id);
}

/**
 * The assignee marks their chore as done. If a verifier was drawn, the chore
 * goes to double-check (verifier notified); if the user is alone (no verifier),
 * it is auto-verified and the XP is granted right away.
 */
export async function completeChoreAction(
  assignmentId: string,
): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(assignmentId);
  if (!id.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  const service = createSupabaseServiceClient();

  const { data: a } = await service
    .from('office_chore_assignments')
    .select('id, organization_id, assignee_id, verifier_id, status')
    .eq('id', id.data)
    .maybeSingle();
  const row = a as {
    id: string;
    organization_id: string;
    assignee_id: string;
    verifier_id: string | null;
    status: string;
  } | null;
  if (!row || row.assignee_id !== user.id || row.status !== 'assigned') {
    return errorResult(de.errors.FORBIDDEN);
  }

  const now = new Date().toISOString();
  if (row.verifier_id) {
    await service
      .from('office_chore_assignments')
      .update({ status: 'done', done_at: now } as never)
      .eq('id', row.id);
    await createNotifications(
      [
        {
          organizationId: row.organization_id,
          recipientId: row.verifier_id,
          type: 'chore' as NotificationType,
          title: 'Ordnungsdienst: Kontrolle nötig',
          body: 'Bitte prüfe kurz einen erledigten Checkpunkt gegen.',
          entityType: 'office_chore',
          entityId: row.id,
        },
      ],
      user.id,
    );
  } else {
    // Solo: nobody to double-check → auto-verify and grant the doer's XP.
    await service
      .from('office_chore_assignments')
      .update({ status: 'verified', done_at: now, verified_at: now } as never)
      .eq('id', row.id);
    await awardChoreXp({
      orgId: row.organization_id,
      assignmentId: row.id,
      doerId: user.id,
      verifierId: null,
    });
  }

  revalidatePath('/app/time');
  return successResult('Danke – erledigt!');
}

/**
 * The drawn verifier double-checks a done chore. On approval both the doer and
 * the verifier receive XP; on rejection the doer is notified to redo it.
 */
export async function verifyChoreAction(
  assignmentId: string,
  approved: boolean,
): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(assignmentId);
  if (!id.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  const service = createSupabaseServiceClient();

  const { data: a } = await service
    .from('office_chore_assignments')
    .select('id, organization_id, assignee_id, verifier_id, status')
    .eq('id', id.data)
    .maybeSingle();
  const row = a as {
    id: string;
    organization_id: string;
    assignee_id: string;
    verifier_id: string | null;
    status: string;
  } | null;
  if (!row || row.verifier_id !== user.id || row.status !== 'done') {
    return errorResult(de.errors.FORBIDDEN);
  }

  const now = new Date().toISOString();
  if (approved) {
    await service
      .from('office_chore_assignments')
      .update({ status: 'verified', verified_at: now } as never)
      .eq('id', row.id);
    await awardChoreXp({
      orgId: row.organization_id,
      assignmentId: row.id,
      doerId: row.assignee_id,
      verifierId: user.id,
    });
  } else {
    await service
      .from('office_chore_assignments')
      .update({ status: 'rejected', verified_at: now } as never)
      .eq('id', row.id);
    await createNotifications(
      [
        {
          organizationId: row.organization_id,
          recipientId: row.assignee_id,
          type: 'chore' as NotificationType,
          title: 'Ordnungsdienst: bitte nachbessern',
          body: 'Dein Checkpunkt wurde bei der Kontrolle zurückgewiesen.',
          entityType: 'office_chore',
          entityId: row.id,
        },
      ],
      user.id,
    );
  }

  revalidatePath('/app/time');
  return successResult(approved ? 'Bestätigt.' : 'Zurückgewiesen.');
}

// --- Admin: manage the chore catalog ---------------------------------------

async function requireChoreAdmin(): Promise<
  { orgId: string } | { error: string }
> {
  const user = await requireUser();
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) return { error: de.errors.FORBIDDEN };
  return { orgId };
}

const textSchema = z.string().trim().min(2).max(200);

/** Admin adds a new checkpoint. */
export async function createChoreAction(text: string): Promise<ActionResult> {
  const parsed = textSchema.safeParse(text);
  if (!parsed.success) return errorResult('Bitte einen Text (2–200 Zeichen) angeben.');
  const auth = await requireChoreAdmin();
  if ('error' in auth) return errorResult(auth.error);

  const service = createSupabaseServiceClient();
  const { error } = await service.from('office_chores').insert({
    organization_id: auth.orgId,
    text: parsed.data,
    active: true,
    position: Date.now(),
  } as never);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/settings');
  return successResult('Checkpunkt hinzugefügt.');
}

/** Admin edits a checkpoint's text and/or active flag. */
export async function updateChoreAction(input: {
  id: string;
  text?: string;
  active?: boolean;
}): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(input.id);
  if (!id.success) return errorResult(de.errors.VALIDATION);
  const auth = await requireChoreAdmin();
  if ('error' in auth) return errorResult(auth.error);

  const patch: { text?: string; active?: boolean } = {};
  if (input.text !== undefined) {
    const t = textSchema.safeParse(input.text);
    if (!t.success) return errorResult('Bitte einen Text (2–200 Zeichen) angeben.');
    patch.text = t.data;
  }
  if (input.active !== undefined) patch.active = input.active;
  if (Object.keys(patch).length === 0) return successResult('Nichts geändert.');

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('office_chores')
    .update(patch as never)
    .eq('id', id.data)
    .eq('organization_id', auth.orgId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/settings');
  return successResult('Gespeichert.');
}

/** Admin deletes a checkpoint. */
export async function deleteChoreAction(choreId: string): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(choreId);
  if (!id.success) return errorResult(de.errors.VALIDATION);
  const auth = await requireChoreAdmin();
  if ('error' in auth) return errorResult(auth.error);

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('office_chores')
    .delete()
    .eq('id', id.data)
    .eq('organization_id', auth.orgId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/settings');
  return successResult('Gelöscht.');
}
