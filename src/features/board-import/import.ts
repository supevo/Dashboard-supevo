import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

/** One task row from the old board export. */
export interface BoardImportRow {
  title: string;
  description: string;
  comments: string;
}

export interface BoardImportOptions {
  projectId: string;
  /** Super-admin performing the migration; author of the migrated comments. */
  actorId: string;
  rows: BoardImportRow[];
  /** Create tasks as internal (team-only) vs. client-visible. */
  taskInternal: boolean;
  /** Store migrated comments as internal (team-only) vs. client-visible. */
  commentInternal: boolean;
}

export interface BoardImportResult {
  tasksCreated: number;
  commentsCreated: number;
  skipped: number;
  error?: string;
}

/** Normalizes exported rich text to plain text with real line breaks. */
export function cleanText(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/(^|\n)[ \t]*\\[ \t]*(?=\n|$)/g, '$1') // stray "\" lines from the export
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Splits a packed comment cell into individual comments. The export separates
 * turns with a <br /> marker; we split on that and keep each turn's original
 * "Name: …" prefix inside the body (old authors can't be mapped to real
 * accounts). Cells without a marker become a single comment — nothing is lost.
 */
export function splitComments(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/<br\s*\/?>/gi)
    .map((p) => cleanText(p))
    .filter((p) => p.length > 0);
}

/**
 * Bulk-migrates old-board rows into a project board. Uses the service client;
 * the caller MUST have verified super-admin. No XP, no notifications, no
 * auto-estimate — this is a data migration, not normal task creation. Tasks
 * land in the board's "queue" column (or the first column), appended in order.
 */
export async function importBoardTasks(
  opts: BoardImportOptions,
): Promise<BoardImportResult> {
  const empty = { tasksCreated: 0, commentsCreated: 0, skipped: 0 };
  const service = createSupabaseServiceClient();

  const { data: project } = await service
    .from('projects')
    .select('id, organization_id')
    .eq('id', opts.projectId)
    .maybeSingle();
  if (!project) return { ...empty, error: 'Projekt nicht gefunden.' };

  const { data: board } = await service
    .from('boards')
    .select('id')
    .eq('project_id', opts.projectId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!board) return { ...empty, error: 'Für dieses Projekt existiert kein Board.' };

  const { data: columns } = await service
    .from('board_columns')
    .select('id, column_key, position')
    .eq('board_id', board.id)
    .order('position', { ascending: true });
  const target =
    (columns ?? []).find((c) => c.column_key === 'queue') ?? (columns ?? [])[0];
  if (!target) return { ...empty, error: 'Das Board hat keine Spalten.' };

  const { data: maxRow } = await service
    .from('tasks')
    .select('position')
    .eq('column_id', target.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  let position = (maxRow?.position ?? 0) + 1000;

  let tasksCreated = 0;
  let commentsCreated = 0;
  let skipped = 0;

  for (const row of opts.rows) {
    const title = (row.title ?? '').trim();
    if (!title) {
      skipped++;
      continue;
    }
    const description = cleanText(row.description ?? '');

    const { data: task, error } = await service
      .from('tasks')
      .insert({
        organization_id: project.organization_id,
        project_id: opts.projectId,
        board_id: board.id,
        column_id: target.id,
        title: title.slice(0, 200),
        description: description ? description : null,
        priority: 'medium',
        is_internal: opts.taskInternal,
        created_by: opts.actorId,
        position,
      })
      .select('id')
      .single();
    position += 1000;

    if (error || !task) {
      skipped++;
      continue;
    }
    tasksCreated++;

    const comments = splitComments(row.comments ?? '');
    if (comments.length > 0) {
      const payload = comments.map((body) => ({
        organization_id: project.organization_id,
        project_id: opts.projectId,
        task_id: task.id,
        author_id: opts.actorId,
        body: body.slice(0, 20000),
        is_internal: opts.commentInternal,
      }));
      const { error: cErr } = await service.from('comments').insert(payload);
      if (!cErr) commentsCreated += payload.length;
    }
  }

  return { tasksCreated, commentsCreated, skipped };
}
