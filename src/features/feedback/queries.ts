import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export type FeedbackKind = 'bug' | 'idea' | 'wish';
export type FeedbackStatus =
  | 'new'
  | 'planned'
  | 'in_progress'
  | 'done'
  | 'rejected';

export interface FeedbackItem {
  id: string;
  kind: FeedbackKind;
  title: string;
  message: string | null;
  status: FeedbackStatus;
  authorName: string | null;
  authorRole: string;
  adminNotes: string | null;
  createdAt: string;
}

/** All feedback of an org for the admin board (newest first). */
export async function listFeedback(orgId: string): Promise<FeedbackItem[]> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('feedback')
    .select(
      'id, kind, title, message, status, author_name, author_role, admin_notes, created_at',
    )
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((f) => ({
    id: f.id,
    kind: f.kind as FeedbackKind,
    title: f.title,
    message: f.message,
    status: f.status as FeedbackStatus,
    authorName: f.author_name,
    authorRole: f.author_role,
    adminNotes: f.admin_notes,
    createdAt: f.created_at,
  }));
}
