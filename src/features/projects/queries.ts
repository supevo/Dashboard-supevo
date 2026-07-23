import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ProjectStatus } from '@/lib/database.types';

export interface ProjectListItem {
  id: string;
  name: string;
  status: ProjectStatus;
  clientCompanyId: string;
  isClientVisible: boolean;
  dueDate: string | null;
}

/** Lists projects the current user can access (RLS enforced). */
export async function listProjects(orgId: string): Promise<ProjectListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('projects')
    .select('id, name, status, client_company_id, is_client_visible, due_date')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    clientCompanyId: p.client_company_id,
    isClientVisible: p.is_client_visible,
    dueDate: p.due_date,
  }));
}

export interface ProjectDetail extends ProjectListItem {
  description: string | null;
  organizationId: string;
  canManage: boolean;
}

/** Loads a single project the user can access, plus whether they may manage it. */
export async function getProject(
  projectId: string,
): Promise<ProjectDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('projects')
    .select(
      'id, organization_id, name, description, status, client_company_id, is_client_visible, due_date',
    )
    .eq('id', projectId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!data) return null;

  const { data: canManage } = await supabase.rpc('can_manage_project', {
    p_project_id: projectId,
  });

  return {
    id: data.id,
    organizationId: data.organization_id,
    name: data.name,
    description: data.description,
    status: data.status,
    clientCompanyId: data.client_company_id,
    isClientVisible: data.is_client_visible,
    dueDate: data.due_date,
    canManage: canManage === true,
  };
}

export interface ProjectMemberInfo {
  userId: string;
  name: string;
}

/** Lists members of a project (for assignee pickers/filters). */
export async function listProjectMembers(
  projectId: string,
): Promise<ProjectMemberInfo[]> {
  const supabase = await createSupabaseServerClient();
  const { data: members } = await supabase
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId);
  if (!members || members.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in(
      'id',
      members.map((m) => m.user_id),
    );
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? ''] as const),
  );
  return members.map((m) => ({
    userId: m.user_id,
    name: nameById.get(m.user_id) || '—',
  }));
}
