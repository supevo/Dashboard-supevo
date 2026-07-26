'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { createNotifications } from '@/features/notifications/create';
import { logActivity } from '@/lib/audit';
import { completeText, isAiEnabled } from '@/lib/ai/complete';
import { getCurrentAbsenceByUser } from '@/features/absences/queries';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

interface Candidate {
  userId: string;
  name: string;
  skills: { name: string; level: number }[];
  prefs: { name: string; level: number }[];
  openTasks: number;
  absent: boolean;
}

function extractJson(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  return s !== -1 && e > s ? t.slice(s, e + 1) : t;
}

/** Simple fallback score when AI is unavailable: likes + skill, minus load. */
function heuristicPick(candidates: Candidate[]): Candidate | null {
  const available = candidates.filter((c) => !c.absent);
  const pool = available.length > 0 ? available : candidates;
  let best: Candidate | null = null;
  let bestScore = -Infinity;
  for (const c of pool) {
    const skill = c.skills.reduce((n, s) => n + s.level, 0);
    const pref = c.prefs.reduce((n, p) => n + p.level, 0) * 1.5;
    const score = skill + pref - c.openTasks * 2;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * Picks the best assignee for a task from the project members, weighing skills,
 * work preferences (Lieblingsarbeit) and current workload — and avoiding people
 * who are currently absent. Uses the AI when available, else a heuristic.
 */
export async function autoAssignTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({ projectId: z.string().uuid(), taskId: z.string().uuid() })
    .safeParse({
      projectId: formData.get('projectId'),
      taskId: formData.get('taskId'),
    });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { projectId, taskId } = parsed.data;

  const actor = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: task } = await supabase
    .from('tasks')
    .select('organization_id, title, description, project_id')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return errorResult(de.errors.NOT_FOUND);

  const { data: members } = await supabase
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId);
  const memberIds = [...new Set((members ?? []).map((m) => m.user_id))];
  if (memberIds.length === 0) {
    return errorResult('Das Projekt hat keine Mitglieder zum Zuweisen.');
  }

  const [
    { data: profiles },
    { data: skills },
    { data: prefs },
    absenceMap,
    { data: alreadyAssigned },
  ] = await Promise.all([
      supabase.from('profiles').select('id, full_name').in('id', memberIds),
      supabase
        .from('employee_skills')
        .select('user_id, name, level')
        .in('user_id', memberIds),
      supabase
        .from('work_preferences')
        .select('user_id, name, level')
        .in('user_id', memberIds),
      getCurrentAbsenceByUser(),
      supabase.from('task_assignees').select('user_id').eq('task_id', taskId),
    ]);

  // Workload: count each member's non-done, non-archived assigned tasks.
  const { data: assignRows } = await supabase
    .from('task_assignees')
    .select('user_id, task_id')
    .in('user_id', memberIds);
  const taskIds = [...new Set((assignRows ?? []).map((a) => a.task_id))];
  const { data: openTaskRows } = taskIds.length
    ? await supabase
        .from('tasks')
        .select('id, column_id, is_archived, deleted_at')
        .in('id', taskIds)
    : { data: [] as { id: string; column_id: string; is_archived: boolean; deleted_at: string | null }[] };
  const { data: cols } = await supabase
    .from('board_columns')
    .select('id, column_key');
  const doneCols = new Set((cols ?? []).filter((c) => c.column_key === 'done').map((c) => c.id));
  const openTaskIds = new Set(
    (openTaskRows ?? [])
      .filter((t) => !t.is_archived && !t.deleted_at && !doneCols.has(t.column_id))
      .map((t) => t.id),
  );
  const loadByUser = new Map<string, number>();
  for (const a of assignRows ?? []) {
    if (openTaskIds.has(a.task_id)) {
      loadByUser.set(a.user_id, (loadByUser.get(a.user_id) ?? 0) + 1);
    }
  }

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? '—'] as const));
  const assignedSet = new Set((alreadyAssigned ?? []).map((a) => a.user_id));
  const candidates: Candidate[] = memberIds.map((id) => ({
    userId: id,
    name: nameById.get(id) ?? '—',
    skills: (skills ?? [])
      .filter((s) => s.user_id === id)
      .map((s) => ({ name: s.name, level: s.level })),
    prefs: (prefs ?? [])
      .filter((p) => p.user_id === id)
      .map((p) => ({ name: p.name, level: p.level })),
    openTasks: loadByUser.get(id) ?? 0,
    absent: absenceMap.has(id),
  }));

  let chosenId: string | null = null;
  let reason = '';

  if (isAiEnabled()) {
    const lines = candidates.map((c) => {
      const sk = c.skills.length
        ? c.skills.map((s) => `${s.name} ${s.level}/10`).join(', ')
        : 'keine';
      const pr = c.prefs.length
        ? c.prefs.map((p) => `${p.name} ${p.level}/10`).join(', ')
        : 'keine';
      return `- id=${c.userId} | ${c.name} | Faehigkeiten: ${sk} | Lieblingsarbeit: ${pr} | offene Aufgaben: ${c.openTasks}${c.absent ? ' | ABWESEND' : ''}`;
    });
    const result = await completeText({
      system: `Du verteilst Aufgaben in einer Marketing-Agentur. Waehle die EINE beste Person fuer die Aufgabe.
Beruecksichtige: passende Faehigkeiten (Level), Lieblingsarbeit (Vorlieben) und aktuelle Auslastung (weniger offene Aufgaben ist besser). ABWESENDE Personen NICHT waehlen, ausser es gibt keine Alternative.
Antworte AUSSCHLIESSLICH mit JSON: {"userId":"<id>","reason":"kurze Begruendung auf Deutsch"}`,
      prompt: `Aufgabe: ${task.title}\n${task.description ? `Beschreibung: ${task.description}\n` : ''}\nKandidaten:\n${lines.join('\n')}`,
      maxTokens: 300,
    });
    if (result) {
      try {
        const p = JSON.parse(extractJson(result.text)) as {
          userId?: unknown;
          reason?: unknown;
        };
        if (typeof p.userId === 'string' && candidates.some((c) => c.userId === p.userId)) {
          chosenId = p.userId;
          reason = typeof p.reason === 'string' ? p.reason.trim() : '';
        }
      } catch {
        /* fall through to heuristic */
      }
    }
  }

  if (!chosenId) {
    const pick = heuristicPick(candidates);
    if (pick) {
      chosenId = pick.userId;
      reason = 'Beste Kombination aus Fähigkeiten, Vorlieben und freier Kapazität.';
    }
  }
  if (!chosenId) return errorResult('Keine passende Person gefunden.');

  const chosenName = nameById.get(chosenId) ?? '—';

  if (!assignedSet.has(chosenId)) {
    const { error } = await supabase.from('task_assignees').insert({
      task_id: taskId,
      user_id: chosenId,
      organization_id: task.organization_id,
    });
    if (error) return errorResult(de.errors.FORBIDDEN);

    await createNotifications(
      [
        {
          organizationId: task.organization_id,
          recipientId: chosenId,
          type: 'task_assigned',
          title: 'Ihnen wurde eine Aufgabe zugewiesen',
          body: task.title,
          entityType: 'task',
          entityId: taskId,
        },
      ],
      actor.id,
    );
    await logActivity({
      actorId: actor.id,
      organizationId: task.organization_id,
      action: 'assignee_change',
      entityType: 'task',
      entityId: taskId,
      metadata: { assigned: chosenId, byAi: true },
    });
  }

  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  return successResult(
    `${chosenName} zugewiesen${reason ? ` – ${reason}` : ''}.`,
  );
}
