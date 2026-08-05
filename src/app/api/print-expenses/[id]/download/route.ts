import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { FILES_BUCKET } from '@/lib/files/storage';
import { logger } from '@/lib/logger';

/**
 * Streams a print-expense invoice. Access is gated by the RLS read of the
 * expense row (only org admins / super admins can see it); the bytes are then
 * fetched with the service client.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data: expense } = await supabase
    .from('print_expenses')
    .select('storage_path, file_name, file_mime')
    .eq('id', id)
    .maybeSingle();
  if (!expense) return new NextResponse(null, { status: 404 });

  let blob: Blob | null = null;
  try {
    const { data } = await createSupabaseServiceClient()
      .storage.from(FILES_BUCKET)
      .download(expense.storage_path);
    blob = data;
  } catch (e) {
    logger.warn('print_expense.download.service_unavailable', {
      error: (e as Error).message,
    });
  }
  if (!blob) return new NextResponse(null, { status: 404 });

  const bytes = Buffer.from(await blob.arrayBuffer());
  const filename = encodeURIComponent(expense.file_name || 'rechnung');
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': expense.file_mime || blob.type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      'Cache-Control': 'private, max-age=60',
    },
  });
}
