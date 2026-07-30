import { NextResponse, type NextRequest } from 'next/server';
import { cronUnauthorized } from '@/lib/cron-auth';
import { runChatFileCleanup } from '@/features/messenger/cleanup';
import { logger } from '@/lib/logger';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** Daily job: deletes chat files older than 60 days that aren't marked important. */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  try {
    const result = await runChatFileCleanup();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error('cron.chat_file_cleanup.error', { error: (e as Error).message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
