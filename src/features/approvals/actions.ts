'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { logActivity } from '@/lib/audit';
import { createNotifications } from '@/features/notifications/create';
import { sanitizeRichText } from '@/lib/sanitize';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { decideApprovalSchema, requestApprovalSchema } from './schema';

/** Agency requests client approval for a task. Target column (auto-move on
 *  approval) defaults to the board's done column. */
export async function requestApprovalAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = requestApprovalSchema.safeParse({
    projectId: formData.get('projectId'),
    taskId: formData.get('taskId'),
    title: formData.get('title'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { projectId, taskId, title } = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: project } = await supabase
    .from('projects')
    .select('organization_id, client_company_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return errorResult(de.errors.FORBIDDEN);

  // Auto-move target: the board's done column (configurable per request).
  let targetColumnId: string | null = null;
  const { data: board } = await supabase
    .from('boards')
    .select('id')
    .eq('project_id', projectId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (board) {
    const { data: doneColumn } = await supabase
      .from('board_columns')
      .select('id')
      .eq('board_id', board.id)
      .eq('column_key', 'done')
      .limit(1)
      .maybeSingle();
    targetColumnId = doneColumn?.id ?? null;
  }

  const { data: approval, error } = await supabase
    .from('approvals')
    .insert({
      organization_id: project.organization_id,
      client_company_id: project.client_company_id,
      project_id: projectId,
      task_id: taskId,
      title,
      requested_by: user.id,
      target_column_id: targetColumnId,
    })
    .select('id')
    .single();

  if (error || !approval) {
    return errorResult('Für diese Aufgabe besteht bereits eine offene Freigabe.');
  }

  // Notify the client company's contacts.
  const service = createSupabaseServiceClient();
  const { data: contacts } = await service
    .from('client_contacts')
    .select('user_id')
    .eq('client_company_id', project.client_company_id);
  await createNotifications(
    (contacts ?? []).map((c) => ({
      organizationId: project.organization_id,
      recipientId: c.user_id,
      type: 'task_for_approval' as const,
      title: 'Neue Freigabe angefordert',
      body: title,
      entityType: 'task',
      entityId: taskId,
    })),
    user.id,
  );

  await logActivity({
    actorId: user.id,
    organizationId: project.organization_id,
    action: 'approval_request',
    entityType: 'approval',
    entityId: approval.id,
    metadata: { taskId },
  });

  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  return successResult('Freigabe angefordert.');
}

/** Client decides on an approval. A comment is mandatory unless approving. On
 *  approval the task auto-moves to the configured column. */
export async function decideApprovalAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = decideApprovalSchema.safeParse({
    approvalId: formData.get('approvalId'),
    decision: formData.get('decision'),
    comment: formData.get('comment') ?? '',
  });
  if (!parsed.success) {
    return errorResult(
      parsed.error.flatten().fieldErrors.comment?.[0] ?? de.errors.VALIDATION,
    );
  }
  const { approvalId, decision, comment } = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: approval } = await supabase
    .from('approvals')
    .select(
      'id, organization_id, client_company_id, project_id, task_id, requested_by, target_column_id, status',
    )
    .eq('id', approvalId)
    .maybeSingle();
  if (!approval) return errorResult(de.errors.NOT_FOUND);
  if (approval.status !== 'pending') {
    return errorResult('Diese Freigabe wurde bereits entschieden.');
  }

  // Only the customer (a contact of the client company) may decide.
  const { data: contact } = await supabase
    .from('client_contacts')
    .select('id')
    .eq('user_id', user.id)
    .eq('client_company_id', approval.client_company_id)
    .maybeSingle();
  if (!contact) return errorResult(de.errors.FORBIDDEN);

  const { error } = await supabase
    .from('approvals')
    .update({
      status: decision,
      decision_comment: comment || null,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq('id', approvalId)
    .eq('status', 'pending');
  if (error) return errorResult(de.errors.INTERNAL);

  const service = createSupabaseServiceClient();

  // Entscheidung als SICHTBAREN (nicht-internen) Kommentar an der Aufgabe
  // hinterlegen – Beweislast: Kunde sieht ihn im Portal, Agentur im Board, mit
  // Autor (Kunden-Kontakt) und Zeitstempel. Body wird sicher als HTML gespeichert.
  const decisionLabel =
    decision === 'approved'
      ? '✅ <strong>Freigabe erteilt.</strong>'
      : decision === 'changes_requested'
        ? '✏️ <strong>Änderungen angefordert.</strong>'
        : '⛔ <strong>Freigabe abgelehnt.</strong>';
  const escapedComment = (comment ?? '')
    .replace(/[&<>"]/g, (c) =>
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
    )
    .replace(/\n/g, '<br>');
  const commentBody = sanitizeRichText(
    decisionLabel + (escapedComment ? `<br>${escapedComment}` : ''),
  );
  await service.from('comments').insert({
    organization_id: approval.organization_id,
    project_id: approval.project_id,
    task_id: approval.task_id,
    author_id: user.id,
    body: commentBody,
    is_internal: false,
  });

  // Aufgabe verschieben (Service-Client → WIP-Limits blockieren den Workflow-Move
  // nicht). Freigabe → Ziel-Spalte (i. d. R. „Fertig"). Ablehnung/Änderung →
  // zurück in die Warteschlange, damit die Aufgabe nicht in „Überprüfung" hängt.
  if (decision === 'approved' && approval.target_column_id) {
    await service
      .from('tasks')
      .update({ column_id: approval.target_column_id })
      .eq('id', approval.task_id);
  } else if (decision !== 'approved') {
    const { data: board } = await service
      .from('boards')
      .select('id')
      .eq('project_id', approval.project_id)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (board) {
      const { data: queueCol } = await service
        .from('board_columns')
        .select('id')
        .eq('board_id', board.id)
        .eq('column_key', 'queue')
        .limit(1)
        .maybeSingle();
      if (queueCol) {
        await service
          .from('tasks')
          .update({ column_id: queueCol.id })
          .eq('id', approval.task_id);
      }
    }
  }

  await createNotifications(
    [
      {
        organizationId: approval.organization_id,
        recipientId: approval.requested_by,
        type:
          decision === 'approved'
            ? ('approval_granted' as const)
            : ('changes_requested' as const),
        title:
          decision === 'approved'
            ? 'Freigabe erteilt'
            : 'Änderungen angefordert',
        body: comment || null,
        entityType: 'task',
        entityId: approval.task_id,
      },
    ],
    user.id,
  );

  await logActivity({
    actorId: user.id,
    organizationId: approval.organization_id,
    action: 'approval_decision',
    entityType: 'approval',
    entityId: approvalId,
    metadata: { decision },
  });

  revalidatePath('/portal/approvals');
  revalidatePath(`/portal/projects/${approval.project_id}`);
  revalidatePath(`/portal/projects/${approval.project_id}/tasks/${approval.task_id}`);
  revalidatePath(`/app/projects/${approval.project_id}/tasks/${approval.task_id}`);
  revalidatePath(`/app/projects/${approval.project_id}`);
  return successResult('Entscheidung gespeichert.');
}
