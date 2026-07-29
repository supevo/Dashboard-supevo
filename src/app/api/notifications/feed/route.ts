import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/features/auth/session';

/**
 * Feed for the header notification bell: the most recent notifications (read and
 * unread) plus the unread count for the badge. RLS scopes rows to the recipient.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const [listRes, countRes] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, type, title, body, entity_type, entity_id, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(15),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false),
  ]);

  return NextResponse.json({
    unreadCount: countRes.count ?? 0,
    notifications: (listRes.data ?? []).map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      entityType: n.entity_type,
      entityId: n.entity_id,
      isRead: n.is_read,
      createdAt: n.created_at,
    })),
  });
}
