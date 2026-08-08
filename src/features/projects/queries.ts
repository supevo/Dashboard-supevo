import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
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

/**
 * Lists a single client's projects (= boards), oldest first. The order matters:
 * the first board is the client's "primary" board – the only one exposed in the
 * portal unless another is explicitly released. RLS-scoped.
 */
export async function listClientProjects(
  orgId: string,
  clientCompanyId: string,
): Promise<ProjectListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('projects')
    .select('id, name, status, client_company_id, is_client_visible, due_date')
    .eq('organization_id', orgId)
    .eq('client_company_id', clientCompanyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

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

/**
 * Candidate assignees for a project: all active agency staff of the project's
 * organization. Agency staff have org-wide project access (they don't need an
 * explicit project_members row), so the assignee picker must offer the whole
 * team – not just people already listed on the project.
 *
 * Access is gated by the caller (agency page + RLS-scoped getProject); we first
 * resolve the org via the RLS client (returns nothing if the caller can't see
 * the project), then use the service client to read the roster.
 */
export async function listProjectMembers(
  projectId: string,
): Promise<ProjectMemberInfo[]> {
  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return [];

  const service = createSupabaseServiceClient();
  const { data: memberships } = await service
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', project.organization_id)
    .eq('status', 'active');

  const staffIds = [
    ...new Set(
      (memberships ?? [])
        .filter((m) =>
          ['agency_admin', 'project_manager', 'employee', 'freelancer'].includes(
            m.role,
          ),
        )
        .map((m) => m.user_id),
    ),
  ];
  if (staffIds.length === 0) return [];

  const { data: profiles } = await service
    .from('profiles')
    .select('id, full_name')
    .in('id', staffIds);
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? ''] as const),
  );

  return staffIds
    .map((id) => ({ userId: id, name: nameById.get(id) || '—' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
