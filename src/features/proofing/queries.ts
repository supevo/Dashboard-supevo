import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import type { ImageAnnotation, Stroke } from './types';

/** File the caller may see (RLS-gated) → its org/task for later checks. */
export async function getVisibleFileMeta(
  fileId: string,
): Promise<{ organizationId: string; taskId: string | null; projectId: string; mimeType: string } | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('files')
    .select('organization_id, task_id, project_id, mime_type')
    .eq('id', fileId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) return null;
  return {
    organizationId: data.organization_id,
    taskId: data.task_id,
    projectId: data.project_id,
    mimeType: data.mime_type,
  };
}

function normalizeStrokes(raw: unknown): Stroke[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Stroke => Array.isArray(s))
    .map((s) =>
      s
        .filter(
          (p): p is { x: number; y: number } =>
            !!p && typeof p.x === 'number' && typeof p.y === 'number',
        )
        .map((p) => ({ x: p.x, y: p.y })),
    )
    .filter((s) => s.length > 0);
}

/**
 * Annotations for a file. The caller must have passed the file-visibility check
 * (getVisibleFileMeta) first; the read itself uses the service client so clients
 * (who can't select the annotations table under RLS) still get their proofs.
 */
export async function listImageAnnotations(fileId: string): Promise<ImageAnnotation[]> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('image_annotations')
    .select('id, strokes, comment, status, created_by, created_at')
    .eq('file_id', fileId)
    .order('created_at', { ascending: true });
  const rows = data ?? [];

  const ids = [...new Set(rows.map((r) => r.created_by).filter((v): v is string => !!v))];
  const nameById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await service
      .from('profiles')
      .select('id, full_name')
      .in('id', ids);
    for (const p of profiles ?? []) nameById.set(p.id, p.full_name ?? '—');
  }

  return rows.map((r) => ({
    id: r.id,
    strokes: normalizeStrokes(r.strokes),
    comment: r.comment,
    status: (r.status === 'done' ? 'done' : 'open') as 'open' | 'done',
    authorName: r.created_by ? nameById.get(r.created_by) ?? '—' : '—',
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}
