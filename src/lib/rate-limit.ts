/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * Adequate for a single-instance self-hosted deployment. For a multi-instance
 * setup replace the store with a shared backend (Postgres/Redis) — the call
 * sites stay the same. Auth endpoints (login, password reset, sign-up) are
 * additionally rate-limited by Supabase GoTrue server-side.
 */

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
