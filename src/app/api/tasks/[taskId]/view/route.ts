import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Records a task view (agency only). `action: 'open'` inserts a view row and
 * returns its id; `action: 'update'` sets the dwell time for a prior view.
 * Called on open and via sendBeacon when the user leaves the task.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }

  let body: { action?: string; viewId?: string; dwell?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  if (body.action === 'update' && body.viewId) {
    const dwell = Math.max(0, Math.min(86_400, Math.round(Number(body.dwell) || 0)));
    await supabase
      .from('task_views')
      .update({ dwell_seconds: dwell })
      .eq('id', body.viewId)
      .eq('user_id', user.id);
    return NextResponse.json({ ok: true });
  }

  // Default: open — resolve org from the task (RLS-scoped) and insert a view.
  const { data: task } = await supabase
    .from('tasks')
    .select('organization_id')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return NextResponse.json({ ok: false }, { status: 404 });

  const { data, error } = await supabase
    .from('task_views')
    .insert({
      task_id: taskId,
      organization_id: task.organization_id,
      user_id: user.id,
    })
    .select('id')
    .maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false }, { status: 403 });

  return NextResponse.json({ ok: true, viewId: data.id });
}
