import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/features/auth/session';
import { createSignedFileUrl } from '@/lib/files/storage';

/**
 * Serves a profile avatar by redirecting to a short-lived signed URL. The
 * profiles-table RLS (coworker-visible) is the authorization gate. Returns 404
 * when the user has no avatar or the caller may not see the profile.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;

  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.avatar_url) return new NextResponse(null, { status: 404 });

  const url = await createSignedFileUrl(supabase, profile.avatar_url, 'inline');
  if (!url) return new NextResponse(null, { status: 500 });

  return NextResponse.redirect(url);
}
