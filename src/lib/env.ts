import { z } from 'zod';

/**
 * Validated environment access.
 *
 * Client-safe values (NEXT_PUBLIC_*) are validated eagerly. Server-only
 * secrets are validated lazily via `serverEnv()` so they are never bundled
 * into client code and a missing secret fails fast on the server only.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

// Reference each variable explicitly – Next.js only inlines statically
// referenced NEXT_PUBLIC_* values.
const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

export const env = clientEnv;

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

type ServerEnv = z.infer<typeof serverSchema>;

let cachedServerEnv: ServerEnv | null = null;

/**
 * Returns validated server-only environment variables. Throws if called in a
 * browser context to guarantee secrets never leak client-side.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() darf nicht im Browser aufgerufen werden.');
  }
  if (!cachedServerEnv) {
    cachedServerEnv = serverSchema.parse({
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      LOG_LEVEL: process.env.LOG_LEVEL,
    });
  }
  return cachedServerEnv;
}
