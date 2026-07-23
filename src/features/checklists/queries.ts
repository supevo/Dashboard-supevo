import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface ChecklistItemView {
  id: string;
  content: string;
  isDone: boolean;
  position: number;
}

export interface ChecklistView {
  id: string;
  title: string;
  items: ChecklistItemView[];
  doneCount: number;
  totalCount: number;
}

/** Lists checklists + items for a task (agency-internal; RLS enforced). */
export async function listTaskChecklists(
  taskId: string,
): Promise<ChecklistView[]> {
  const supabase = await createSupabaseServerClient();
  const { data: checklists } = await supabase
    .from('checklists')
    .select('id, title, position')
    .eq('task_id', taskId)
    .order('position', { ascending: true });
  if (!checklists || checklists.length === 0) return [];

  const { data: items } = await supabase
    .from('checklist_items')
    .select('id, checklist_id, content, is_done, position')
    .in(
      'checklist_id',
      checklists.map((c) => c.id),
    )
    .order('position', { ascending: true });

  return checklists.map((c) => {
    const myItems = (items ?? []).filter((i) => i.checklist_id === c.id);
    return {
      id: c.id,
      title: c.title,
      items: myItems.map((i) => ({
        id: i.id,
        content: i.content,
        isDone: i.is_done,
        position: i.position,
      })),
      doneCount: myItems.filter((i) => i.is_done).length,
      totalCount: myItems.length,
    };
  });
}
