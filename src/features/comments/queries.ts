import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface CommentView {
  id: string;
  body: string;
  isInternal: boolean;
  authorId: string;
  authorName: string;
  authorHasAvatar: boolean;
  authorStatus: string | null;
  createdAt: string;
  editedAt: string | null;
  canEdit: boolean;
}

/** Lists comments for a task. RLS hides internal comments from clients. */
export async function listTaskComments(
  taskId: string,
  currentUserId: string,
): Promise<CommentView[]> {
  const supabase = await createSupabaseServerClient();
  const { data: comments } = await supabase
    .from('comments')
    .select('id, body, is_internal, author_id, created_at, edited_at')
    .eq('task_id', taskId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (!comments || comments.length === 0) return [];

  const authorIds = [...new Set(comments.map((c) => c.author_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, status')
    .in('id', authorIds);
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? '—'] as const),
  );
  const avatarById = new Map(
    (profiles ?? []).map((p) => [p.id, Boolean(p.avatar_url)] as const),
  );
  const statusById = new Map(
    (profiles ?? []).map((p) => [p.id, p.status ?? null] as const),
  );

  return comments.map((c) => ({
    id: c.id,
    body: c.body,
    isInternal: c.is_internal,
    authorId: c.author_id,
    authorName: nameById.get(c.author_id) ?? '—',
    authorHasAvatar: avatarById.get(c.author_id) ?? false,
    authorStatus: statusById.get(c.author_id) ?? null,
    createdAt: c.created_at,
    editedAt: c.edited_at,
    canEdit: c.author_id === currentUserId,
  }));
}
