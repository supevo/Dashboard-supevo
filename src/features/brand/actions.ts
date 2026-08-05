'use server';

import { cookies } from 'next/headers';
import { getCurrentUser, hasAgencyAccess } from '@/features/auth/session';
import { BRAND_COOKIE, isBrand, type Brand } from '@/lib/brand';

type Result = { ok: true; brand: Brand } | { ok: false; error: string };

/**
 * Switches the app look (classic / supevo) for the current browser via a
 * cookie the root layout reads. No database involved – a per-browser display
 * preference. Restricted to agency staff (the control lives in admin settings).
 */
export async function setBrandAction(brand: string): Promise<Result> {
  if (!isBrand(brand)) return { ok: false, error: 'Ungültiges Design.' };

  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return { ok: false, error: 'Keine Berechtigung.' };
  }

  (await cookies()).set(BRAND_COOKIE, brand, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return { ok: true, brand };
}
