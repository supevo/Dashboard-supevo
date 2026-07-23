import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ApprovalStatus } from '@/lib/database.types';

export interface ApprovalView {
  id: string;
  projectId: string;
  taskId: string;
  title: string;
  status: ApprovalStatus;
  decisionComment: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** Lists approvals for a project (RLS: agency + the project's client). */
export async function listProjectApprovals(
  projectId: string,
): Promise<ApprovalView[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('approvals')
    .select(
      'id, project_id, task_id, title, status, decision_comment, created_at, decided_at',
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  return (data ?? []).map(mapApproval);
}

/** Lists all pending approvals visible to the current user (client portal). */
export async function listPendingApprovals(): Promise<ApprovalView[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('approvals')
    .select(
      'id, project_id, task_id, title, status, decision_comment, created_at, decided_at',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return (data ?? []).map(mapApproval);
}

function mapApproval(a: {
  id: string;
  project_id: string;
  task_id: string;
  title: string;
  status: ApprovalStatus;
  decision_comment: string | null;
  created_at: string;
  decided_at: string | null;
}): ApprovalView {
  return {
    id: a.id,
    projectId: a.project_id,
    taskId: a.task_id,
    title: a.title,
    status: a.status,
    decisionComment: a.decision_comment,
    createdAt: a.created_at,
    decidedAt: a.decided_at,
  };
}
