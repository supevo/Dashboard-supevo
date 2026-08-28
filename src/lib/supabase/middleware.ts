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

  // getUser() ist ein Auth-Netzwerkcall zu Supabase. Damit ein langsamer Call
  // NIEMALS das Edge-Limit reißt (504 MIDDLEWARE_INVOCATION_TIMEOUT), wird er
  // hart gedeckelt: Kommt binnen AUTH_TIMEOUT_MS keine Antwort (oder ein
  // Fehler), lässt die Middleware den Request durch – die Seite prüft die
  // Anmeldung selbst erneut (requireUser/requireClientPage) und leitet ggf. um.
  // So wird aus einem langsamen Call ein schneller Durchlass statt eines
  // Gateway-Timeouts. Den Netzwerkcall ganz einsparen würde erst das lokale
  // JWT-Verifizieren (asymmetrische Signing-Keys + getClaims) – separater Schritt.
  const AUTH_TIMEOUT_MS = 2500;
  let user: import('@supabase/supabase-js').User | null = null;
  try {
    user = await Promise.race([
      supabase.auth.getUser().then((r) => r.data.user),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('auth-timeout')), AUTH_TIMEOUT_MS),
      ),
    ]);
  } catch {
    return response;
  }

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Only ever store a relative path to prevent open-redirect attacks.
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
