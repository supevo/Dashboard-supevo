import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface Label {
  id: string;
  name: string;
  color: string;
  description: string | null;
  isActive: boolean;
  isClientVisible: boolean;
  intensity: number;
}

/** Lists labels of an organization (RLS: clients see only client-visible). */
export async function listLabels(orgId: string): Promise<Label[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('labels')
    .select('id, name, color, description, is_active, is_client_visible, intensity')
    .eq('organization_id', orgId)
    .order('name', { ascending: true });

  return (data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
    description: l.description,
    isActive: l.is_active,
    isClientVisible: l.is_client_visible,
    intensity: l.intensity ?? 1,
  }));
}

export interface TaskLabel {
  id: string;
  name: string;
  color: string;
  intensity: number;
}

/** Lists labels attached to a task (RLS enforced). */
export async function listTaskLabels(taskId: string): Promise<TaskLabel[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('task_labels')
    .select('label_id')
    .eq('task_id', taskId);
  const labelIds = (data ?? []).map((r) => r.label_id);
  if (labelIds.length === 0) return [];

  const { data: labels } = await supabase
    .from('labels')
    .select('id, name, color, intensity')
    .in('id', labelIds);
  return (labels ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
    intensity: l.intensity ?? 1,
  }));
}
