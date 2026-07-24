import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/features/auth/session';

/**
 * Returns the current user's most recent unread notifications. Used by the
 * browser-notification poller. RLS scopes rows to the recipient.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('notifications')
    .select('id, title, body, created_at')
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({
    notifications: (data ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      createdAt: n.created_at,
    })),
  });
}
