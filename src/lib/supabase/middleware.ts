import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import type { Database } from '@/lib/database.types';

/** Public routes reachable without authentication. */
const PUBLIC_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/invite',
  '/auth',
  '/no-access',
  '/api/inquiries', // public webhook, authenticated by secret URL token
  '/api/cron', // Vercel-Crons – jede Route prüft selbst das CRON_SECRET
];

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Refreshes the Supabase session on every request and guards protected
 * routes. Unauthenticated access to a protected route is redirected to
 * /login with a safe (relative-only) `redirectTo` parameter.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Anmeldung möglichst LOKAL aus dem JWT prüfen statt per Netzwerk-Call.
  // getClaims() verifiziert die Signatur lokal, sobald in Supabase asymmetrische
  // JWT-Signing-Keys aktiv sind (Settings → JWT Keys): dann macht die Middleware
  // KEINEN Auth-Netzwerkcall mehr pro Request (nur einmalig JWKS, danach
  // gecacht) und kann nicht mehr in Cross-Region-Timeouts laufen. Ohne
  // Signing-Keys fällt getClaims intern auf getUser() zurück – also wie bisher,
  // ohne Regressionsrisiko. Ein transienter Fehler lässt den Request durch; die
  // Seite prüft selbst erneut (requireUser/requireClientPage).
  let authed = false;
  try {
    const { data } = await supabase.auth.getClaims();
    authed = Boolean(data?.claims?.sub);
  } catch {
    return response;
  }

  const { pathname } = request.nextUrl;

  if (!authed && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Only ever store a relative path to prevent open-redirect attacks.
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
