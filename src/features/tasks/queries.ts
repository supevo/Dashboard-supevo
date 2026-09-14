import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { livePresence } from '@/features/presence/status';
import type { ColumnKey, TaskPriority } from '@/lib/database.types';

export interface TaskDetail {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  isInternal: boolean;
  isBlocked: boolean;
  isExpress: boolean;
  isArchived: boolean;
  isIdea: boolean;
  dueDate: string | null;
  estimatedMinutes: number | null;
  aiEstimateMinutes: number | null;
  manualEstimateMinutes: number | null;
  actualMinutes: number;
  lockVersion: number;
  assignees: TaskAssignee[];
  canManage: boolean;
  clientNotifiedAt: string | null;
  /** null | 'required' (Rechnung fehlt) | 'settled' (hochgeladen). */
  printBillingStatus: string | null;
  /** null | 'required' | 'confirmed' | 'self_paid' | 'dismissed' (Ads). */
  adsBillingStatus: string | null;
  /** Prüfer (Kontrolle & Beratung) – optional, eine Person. */
  reviewerId: string | null;
  reviewerName: string | null;
  /** Gesetzt, solange die Aufgabe zur Kontrolle eingereicht ist. */
  reviewSubmittedAt: string | null;
}

/** Loads a single task the user can access, with assignees and manage flag. */
export async function getTaskDetail(taskId: string): Promise<TaskDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data: task } = await supabase
    .from('tasks')
    .select(
      'id, organization_id, project_id, title, description, priority, is_internal, is_blocked, is_express, is_archived, is_idea, due_date, estimated_minutes, ai_estimate_minutes, manual_estimate_minutes, actual_minutes, lock_version, client_notified_at, print_billing_status',
    )
    .eq('id', taskId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!task) return null;

  // Ads-Status separat und resilient laden – die Spalte existiert erst nach
  // Migration 0198. Fehlt sie, bleibt es einfach null (kein Task-Öffnen-Fehler).
  let adsBillingStatus: string | null = null;
  try {
    const { data: adsRow } = await supabase
      .from('tasks')
      .select('ads_billing_status')
      .eq('id', taskId)
      .maybeSingle();
    adsBillingStatus =
      (adsRow as { ads_billing_status?: string | null } | null)
        ?.ads_billing_status ?? null;
  } catch {
    /* Spalte fehlt (Migration 0198 noch nicht eingespielt) → null */
  }

  // Prüfer (Migration 0199) ebenfalls resilient laden.
  let reviewerId: string | null = null;
  let reviewSubmittedAt: string | null = null;
  try {
    const { data: revRow } = await supabase
      .from('tasks')
      .select('reviewer_id, review_submitted_at')
      .eq('id', taskId)
      .maybeSingle();
    reviewerId =
      (revRow as { reviewer_id?: string | null } | null)?.reviewer_id ?? null;
    reviewSubmittedAt =
      (revRow as { review_submitted_at?: string | null } | null)
        ?.review_submitted_at ?? null;
  } catch {
    /* Spalten fehlen (Migration 0199 noch nicht eingespielt) → null */
  }

  const { data: assigneeRows } = await supabase
    .from('task_assignees')
    .select('user_id')
    .eq('task_id', taskId);
  const ids = (assigneeRows ?? []).map((a) => a.user_id);
  const { data: profiles } = ids.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, status, last_seen_at')
        .in('id', ids)
    : { data: [] };
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? ''] as const),
  );
  const avatarById = new Map(
    (profiles ?? []).map((p) => [p.id, Boolean(p.avatar_url)] as const),
  );
  // Derive live presence: a stale heartbeat (closed tab) reads as offline.
  const statusById = new Map(
    (profiles ?? []).map(
      (p) => [p.id, livePresence(p.status, p.last_seen_at)] as const,
    ),
  );

  const { data: canManage } = await supabase.rpc('can_manage_project', {
    p_project_id: task.project_id,
  });

  // Prüfer-Name auflösen (kann ein Nicht-Verantwortlicher sein → separat laden).
  let reviewerName: string | null = null;
  if (reviewerId) {
    reviewerName = nameById.get(reviewerId) ?? null;
    if (!reviewerName) {
      const { data: rp } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', reviewerId)
        .maybeSingle();
      reviewerName = rp?.full_name ?? null;
    }
  }

  return {
    id: task.id,
    organizationId: task.organization_id,
    projectId: task.project_id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    isInternal: task.is_internal,
    isBlocked: task.is_blocked,
    isExpress: task.is_express,
    isArchived: task.is_archived,
    isIdea: task.is_idea,
    dueDate: task.due_date,
    estimatedMinutes: task.estimated_minutes,
    aiEstimateMinutes: task.ai_estimate_minutes,
    manualEstimateMinutes: task.manual_estimate_minutes,
    actualMinutes: task.actual_minutes,
    lockVersion: task.lock_version,
    assignees: ids.map((id) => ({
      userId: id,
      name: nameById.get(id) ?? '',
      hasAvatar: avatarById.get(id) ?? false,
      status: statusById.get(id) ?? null,
    })),
    canManage: canManage === true,
    clientNotifiedAt: task.client_notified_at,
    printBillingStatus: task.print_billing_status,
    adsBillingStatus,
    reviewerId,
    reviewerName,
    reviewSubmittedAt,
  };
}

export interface TaskAssignee {
  userId: string;
  name: string;
  hasAvatar: boolean;
  status: string | null;
}

export interface BoardTaskLabel {
  id: string;
  name: string;
  color: string;
  intensity: number;
}

export interface BoardTask {
  id: string;
  title: string;
  priority: TaskPriority;
  isInternal: boolean;
  isBlocked: boolean;
  isExpress: boolean;
  dueDate: string | null;
  columnId: string;
  position: number;
  lockVersion: number;
  assignees: TaskAssignee[];
  labels: BoardTaskLabel[];
  attachmentCount: number;
  /** Whole days the task has sat in its current column (null for done cards). */
  agingDays: number | null;
  /** Completed task awaiting the current viewer's kudos rating. */
  needsRating: boolean;
  /** When the client was last notified that this task is done (null = never). */
  clientNotifiedAt: string | null;
  /** Print-billing state: null | 'required' | 'settled' | 'dismissed'. */
  printBillingStatus: string | null;
  /** Nur in der persönlichen (kundenübergreifenden) Ansicht gesetzt: Kundenname. */
  clientName?: string | null;
}

export interface BoardColumn {
  id: string;
  name: string;
  columnKey: ColumnKey;
  position: number;
  wipLimit: number | null;
  wipLimitPerUser: number | null;
  isDoneColumn: boolean;
  tasks: BoardTask[];
}

export interface BoardView {
  boardId: string;
  columns: BoardColumn[];
  /** Archived tasks, shown in a read-only "Archiv" column. */
  archived: BoardTask[];
  /** Unverbindliche Ideen (is_idea), im agentur-internen „Ideen"-Bereich. */
  ideas: BoardTask[];
}

/** Loads the first board of a project with its columns and active tasks.
 *  RLS ensures internal tasks are hidden from clients. */
export async function getBoardView(
  projectId: string,
): Promise<BoardView | null> {
  const supabase = await createSupabaseServerClient();

  const { data: board } = await supabase
    .from('boards')
    .select('id')
    .eq('project_id', projectId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!board) return null;

  const { data: columns } = await supabase
    .from('board_columns')
    .select(
      'id, name, column_key, position, wip_limit, wip_limit_per_user, is_done_column',
    )
    .eq('board_id', board.id)
    .order('position', { ascending: true });

  const TASK_SELECT =
    'id, title, priority, is_internal, is_blocked, is_express, is_idea, due_date, column_id, position, lock_version, column_entered_at, completed_by, client_notified_at, print_billing_status';

  const { data: tasks } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('board_id', board.id)
    .eq('is_archived', false)
    // Sicherheitsnetz: Ideen tauchen nie in den aktiven Spalten auf.
    .eq('is_idea', false)
    .is('deleted_at', null)
    .order('position', { ascending: true });

  const { data: archivedRows } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('board_id', board.id)
    .eq('is_archived', true)
    // Echtes Archiv ohne Ideen (die werden separat geladen).
    .eq('is_idea', false)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(100);

  // Ideen (unverbindlich) – separat, für den „Ideen"-Bereich der Agentur.
  const { data: ideaRows } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('board_id', board.id)
    .eq('is_idea', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);

  const taskIds = [
    ...(tasks ?? []).map((t) => t.id),
    ...(archivedRows ?? []).map((t) => t.id),
    ...(ideaRows ?? []).map((t) => t.id),
  ];
  const assigneesByTask = new Map<string, TaskAssignee[]>();
  if (taskIds.length > 0) {
    const { data: assignees } = await supabase
      .from('task_assignees')
      .select('task_id, user_id')
      .in('task_id', taskIds);
    const userIds = [...new Set((assignees ?? []).map((a) => a.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, status, last_seen_at')
      .in('id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000']);
    const nameById = new Map(
      (profiles ?? []).map((p) => [p.id, p.full_name ?? ''] as const),
    );
    const avatarById = new Map(
      (profiles ?? []).map((p) => [p.id, Boolean(p.avatar_url)] as const),
    );
    // Derive live presence: a stale heartbeat (closed tab) reads as offline.
    const statusById = new Map(
      (profiles ?? []).map(
        (p) => [p.id, livePresence(p.status, p.last_seen_at)] as const,
      ),
    );
    for (const a of assignees ?? []) {
      const list = assigneesByTask.get(a.task_id) ?? [];
      list.push({
        userId: a.user_id,
        name: nameById.get(a.user_id) ?? '',
        hasAvatar: avatarById.get(a.user_id) ?? false,
        status: statusById.get(a.user_id) ?? null,
      });
      assigneesByTask.set(a.task_id, list);
    }
  }

  // Labels per task (RLS hides client-invisible labels from clients).
  const labelsByTask = new Map<string, BoardTaskLabel[]>();
  if (taskIds.length > 0) {
    const { data: taskLabels } = await supabase
      .from('task_labels')
      .select('task_id, label_id')
      .in('task_id', taskIds);
    const labelIds = [...new Set((taskLabels ?? []).map((r) => r.label_id))];
    if (labelIds.length > 0) {
      const { data: labels } = await supabase
        .from('labels')
        .select('id, name, color, intensity')
        .in('id', labelIds);
      const labelById = new Map((labels ?? []).map((l) => [l.id, l] as const));
      for (const tl of taskLabels ?? []) {
        const label = labelById.get(tl.label_id);
        if (!label) continue;
        const list = labelsByTask.get(tl.task_id) ?? [];
        list.push({
          id: label.id,
          name: label.name,
          color: label.color,
          intensity: label.intensity ?? 1,
        });
        labelsByTask.set(tl.task_id, list);
      }
    }
  }

  // Attachment counts per task.
  const attachmentsByTask = new Map<string, number>();
  if (taskIds.length > 0) {
    const { data: files } = await supabase
      .from('files')
      .select('task_id')
      .in('task_id', taskIds)
      .is('deleted_at', null);
    for (const f of files ?? []) {
      if (!f.task_id) continue;
      attachmentsByTask.set(
        f.task_id,
        (attachmentsByTask.get(f.task_id) ?? 0) + 1,
      );
    }
  }

  const daysSince = (iso: string | null): number | null => {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    return ms > 0 ? Math.floor(ms / 86_400_000) : 0;
  };

  // A completed task in a done column awaits the current viewer's kudos rating,
  // unless they completed it themselves or already rated it.
  const doneColumnIds = new Set(
    (columns ?? []).filter((c) => c.is_done_column).map((c) => c.id),
  );
  const { data: authData } = await supabase.auth.getUser();
  const meId = authData.user?.id ?? null;
  const ratedTaskIds = new Set<string>();
  if (meId && taskIds.length > 0) {
    const { data: myKudos } = await supabase
      .from('kudos')
      .select('task_id')
      .eq('from_user_id', meId)
      .in('task_id', taskIds);
    for (const k of myKudos ?? []) if (k.task_id) ratedTaskIds.add(k.task_id);
  }
  const needsRatingFor = (t: { id: string; column_id: string; completed_by: string | null }) =>
    doneColumnIds.has(t.column_id) &&
    !!t.completed_by &&
    t.completed_by !== meId &&
    !ratedTaskIds.has(t.id);

  type TaskRow = NonNullable<typeof tasks>[number];
  const toBoardTask = (t: TaskRow, withAging: boolean): BoardTask => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    isInternal: t.is_internal,
    isBlocked: t.is_blocked,
    isExpress: t.is_express,
    dueDate: t.due_date,
    columnId: t.column_id,
    position: t.position,
    lockVersion: t.lock_version,
    assignees: assigneesByTask.get(t.id) ?? [],
    labels: labelsByTask.get(t.id) ?? [],
    attachmentCount: attachmentsByTask.get(t.id) ?? 0,
    agingDays: withAging ? daysSince(t.column_entered_at) : null,
    needsRating: needsRatingFor(t),
    clientNotifiedAt: t.client_notified_at,
    printBillingStatus: t.print_billing_status,
  });

  const columnsOut: BoardColumn[] = (columns ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    columnKey: c.column_key,
    position: c.position,
    wipLimit: c.wip_limit,
    wipLimitPerUser: c.wip_limit_per_user,
    isDoneColumn: c.is_done_column,
    // Aging is only meaningful for in-progress work, not the done column.
    tasks: (tasks ?? [])
      .filter((t) => t.column_id === c.id)
      .map((t) => toBoardTask(t, !c.is_done_column)),
  }));

  const archived = (archivedRows ?? []).map((t) => toBoardTask(t, false));
  const ideas = (ideaRows ?? []).map((t) => toBoardTask(t, false));

  return { boardId: board.id, columns: columnsOut, archived, ideas };
}

const PERSONAL_COLUMN_LABEL: Record<'queue' | 'active' | 'review' | 'done', string> = {
  queue: 'Warteschlange',
  active: 'In Bearbeitung',
  review: 'In Überprüfung',
  done: 'Fertig',
};

/**
 * Persönliches, KUNDENÜBERGREIFENDES Board: alle mir zugewiesenen Aufgaben aus
 * allen (zugänglichen) Kundenprojekten, gebündelt in vier synthetische Spalten
 * (Warteschlange / In Bearbeitung / In Überprüfung / Fertig). Jede Karte trägt
 * ihren Kundennamen. Ein Zug ändert den Status der Aufgabe in IHREM eigenen Board
 * (über setTaskStatusAction) – das WIP-Limit des Kunden greift dabei serverseitig.
 */
export async function getPersonalBoardView(userId: string): Promise<BoardView> {
  const supabase = await createSupabaseServerClient();

  // Zugängliche Projekte (RLS) + Kundennamen.
  const { data: projects } = await supabase
    .from('projects')
    .select('id, client_company_id')
    .limit(400);
  const projectRows = projects ?? [];
  const clientIds = [
    ...new Set(projectRows.map((p) => p.client_company_id).filter((v): v is string => !!v)),
  ];
  const { data: clients } = clientIds.length
    ? await supabase.from('client_companies').select('id, name').in('id', clientIds)
    : { data: [] as { id: string; name: string }[] };
  const clientNameById = new Map((clients ?? []).map((c) => [c.id, c.name] as const));
  const clientByProject = new Map(
    projectRows.map((p) => [
      p.id,
      p.client_company_id ? (clientNameById.get(p.client_company_id) ?? null) : null,
    ]),
  );

  const KEYS = ['queue', 'active', 'review', 'done'] as const;
  const columns: BoardColumn[] = KEYS.map((k, i) => ({
    id: `me-${k}`,
    name: PERSONAL_COLUMN_LABEL[k],
    columnKey: k,
    position: i,
    wipLimit: null,
    wipLimitPerUser: null,
    isDoneColumn: k === 'done',
    tasks: [],
  }));
  const byKey = new Map(columns.map((c) => [c.columnKey, c] as const));

  const boards = await Promise.all(projectRows.map((p) => getBoardView(p.id)));
  boards.forEach((bv, idx) => {
    if (!bv) return;
    const clientName = clientByProject.get(projectRows[idx]!.id) ?? null;
    for (const col of bv.columns) {
      const target = byKey.get(col.columnKey);
      if (!target) continue;
      for (const t of col.tasks) {
        if (!t.assignees.some((a) => a.userId === userId)) continue;
        target.tasks.push({ ...t, columnId: target.id, clientName });
      }
    }
  });

  // Innerhalb der Spalten grob nach Dringlichkeit sortieren (fällig zuerst).
  const rank = (t: BoardTask) =>
    t.dueDate ? new Date(t.dueDate).getTime() : Number.POSITIVE_INFINITY;
  for (const c of columns) c.tasks.sort((a, b) => rank(a) - rank(b));

  return { boardId: 'me', columns, archived: [], ideas: [] };
}

/**
 * „Von mir verantwortet": KUNDENÜBERGREIFENDES Board für Aufgaben, bei denen der
 * aktuelle Nutzer Aufgabenverantwortliche:r ist (tasks.reviewer_id = userId). Er
 * überwacht diese Aufgaben, ohne primär daran zu arbeiten. Aufbau wie das
 * persönliche Board: vier synthetische Spalten, Karten mit Kundenname, ein Zug
 * ändert den Status im Ursprungs-Board (WIP-Limit greift serverseitig).
 */
export async function getOwnedBoardView(userId: string): Promise<BoardView> {
  const supabase = await createSupabaseServerClient();

  // Zugängliche Projekte (RLS) + Kundennamen.
  const { data: projects } = await supabase
    .from('projects')
    .select('id, client_company_id')
    .limit(400);
  const projectRows = projects ?? [];
  const clientIds = [
    ...new Set(projectRows.map((p) => p.client_company_id).filter((v): v is string => !!v)),
  ];
  const { data: clients } = clientIds.length
    ? await supabase.from('client_companies').select('id, name').in('id', clientIds)
    : { data: [] as { id: string; name: string }[] };
  const clientNameById = new Map((clients ?? []).map((c) => [c.id, c.name] as const));
  const clientByProject = new Map(
    projectRows.map((p) => [
      p.id,
      p.client_company_id ? (clientNameById.get(p.client_company_id) ?? null) : null,
    ]),
  );

  const KEYS = ['queue', 'active', 'review', 'done'] as const;
  const columns: BoardColumn[] = KEYS.map((k, i) => ({
    id: `owner-${k}`,
    name: PERSONAL_COLUMN_LABEL[k],
    columnKey: k,
    position: i,
    wipLimit: null,
    wipLimitPerUser: null,
    isDoneColumn: k === 'done',
    tasks: [],
  }));
  const byKey = new Map(columns.map((c) => [c.columnKey, c] as const));

  const boards = await Promise.all(projectRows.map((p) => getBoardView(p.id)));

  // Aufgabenverantwortliche:r wird über tasks.reviewer_id abgebildet. Spalte kann
  // fehlen, solange Migration 0199 nicht eingespielt ist → resilient auflösen.
  const allTaskIds: string[] = [];
  for (const bv of boards) {
    if (!bv) continue;
    for (const col of bv.columns) for (const t of col.tasks) allTaskIds.push(t.id);
  }
  const ownerByTask = new Map<string, string | null>();
  if (allTaskIds.length) {
    try {
      const { data: owners } = await supabase
        .from('tasks')
        .select('id, reviewer_id')
        .in('id', allTaskIds);
      for (const row of owners ?? []) {
        ownerByTask.set(
          row.id,
          (row as { reviewer_id?: string | null }).reviewer_id ?? null,
        );
      }
    } catch {
      // reviewer_id-Spalte existiert noch nicht → Board bleibt leer.
    }
  }

  boards.forEach((bv, idx) => {
    if (!bv) return;
    const clientName = clientByProject.get(projectRows[idx]!.id) ?? null;
    for (const col of bv.columns) {
      const target = byKey.get(col.columnKey);
      if (!target) continue;
      for (const t of col.tasks) {
        if (ownerByTask.get(t.id) !== userId) continue;
        target.tasks.push({ ...t, columnId: target.id, clientName });
      }
    }
  });

  const rank = (t: BoardTask) =>
    t.dueDate ? new Date(t.dueDate).getTime() : Number.POSITIVE_INFINITY;
  for (const c of columns) c.tasks.sort((a, b) => rank(a) - rank(b));

  return { boardId: 'owner', columns, archived: [], ideas: [] };
}
