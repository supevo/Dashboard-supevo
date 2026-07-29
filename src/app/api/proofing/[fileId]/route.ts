import { NextResponse, type NextRequest } from 'next/server';
import { getVisibleFileMeta, listImageAnnotations } from '@/features/proofing/queries';

export const dynamic = 'force-dynamic';

/** Annotations for an image the caller may see. Gated by file RLS. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const meta = await getVisibleFileMeta(fileId);
  if (!meta) return new NextResponse(null, { status: 403 });
  const annotations = await listImageAnnotations(fileId);
  return NextResponse.json({ annotations });
}
