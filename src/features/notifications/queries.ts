import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { NotificationType } from '@/lib/database.types';

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  entityType: string;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

/** Lists the current user's notifications, optionally filtered by type. */
export async function listNotifications(
  type?: NotificationType,
): Promise<NotificationView[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('notifications')
    .select('id, type, title, body, entity_type, entity_id, is_read, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (type) query = query.eq('type', type);

  const { data } = await query;
  return (data ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    entityType: n.entity_type,
    entityId: n.entity_id,
    isRead: n.is_read,
    createdAt: n.created_at,
  }));
}

/** Count of unread notifications for the current user. */
export async function unreadNotificationCount(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);
  return count ?? 0;
}
