import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes (they authenticate themselves; keeping the per-request
     *   Supabase auth network call out of frequent polling/API traffic avoids
     *   middleware timeouts under cross-region latency)
     * - _next/static, _next/image (build assets)
     * - favicon and common static file extensions
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
