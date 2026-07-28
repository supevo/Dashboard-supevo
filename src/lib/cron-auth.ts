import { NextResponse, type NextRequest } from 'next/server';

/**
 * Guards a Vercel Cron endpoint. Returns a 401 response to return early when the
 * caller is not authorized, or null when the request may proceed.
 *
 * Fail-closed: if CRON_SECRET is not configured, every call is rejected (a
 * missing secret must never leave a job like the billing run publicly callable).
 */
export function cronUnauthorized(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new NextResponse('CRON_SECRET not configured', { status: 401 });
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 401 });
  }
  return null;
}
