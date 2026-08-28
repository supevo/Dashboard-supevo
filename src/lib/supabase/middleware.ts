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

  // Das Middleware-Gate entscheidet NUR über die Umleitung zu /login – die
  // eigentliche Sicherheit liegt auf Seitenebene (getCurrentUser/getUser) und in
  // der DB (RLS). Deshalb reicht hier eine LOKALE Prüfung ohne Netzwerkcall:
  //
  //  - Gültiges (nicht abgelaufenes) Access-Token in den Cookies  → eingeloggt,
  //    KEIN Netzwerkcall. Das ist der Normalfall und macht das System schnell
  //    und immun gegen Supabase-Latenz/Edge-Timeouts.
  //  - Abgelaufenes Token  → einmalig getUser() (refresht via Cookie-setAll),
  //    hart gedeckelt mit AUTH_TIMEOUT_MS, damit kein Gateway-Timeout entsteht.
  //  - Kein/kaputtes Token → nicht eingeloggt.
  //
  // Ein transienter Fehler lässt den Request durch; die Seite prüft selbst erneut.
  const AUTH_TIMEOUT_MS = 2500;
  const EXPIRY_SKEW_MS = 10_000; // kurz vor Ablauf schon serverseitig erneuern
  let authed = false;
  try {
    // getSession() liest die Session lokal aus den Cookies (kein Netzwerk).
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      const expiresAtMs = (session.expires_at ?? 0) * 1000;
      if (expiresAtMs - Date.now() > EXPIRY_SKEW_MS) {
        // Token noch gültig → rein lokal.
        authed = true;
      } else {
        // Abgelaufen/kurz davor → einmalig serverseitig prüfen + refreshen.
        const user = await Promise.race([
          supabase.auth.getUser().then((r) => r.data.user),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('auth-timeout')), AUTH_TIMEOUT_MS),
          ),
        ]);
        authed = Boolean(user);
      }
    }
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
