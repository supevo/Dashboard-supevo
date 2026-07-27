import { z } from 'zod';

/**
 * Validated environment access.
 *
 * Both client-safe values (NEXT_PUBLIC_*) and server-only secrets are validated
 * LAZILY (on first property access), never at module import. This matters at
 * build time: `next build` imports every route module while "collecting page
 * data", and eager validation would crash the whole build if a variable is
 * missing in that environment (e.g. a Preview deployment without the vars set).
 * Lazy access means the import is always safe and a missing variable only
 * surfaces when it is actually read at request time.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

type ClientEnv = z.infer<typeof clientSchema>;

// Reference each variable explicitly – Next.js only inlines statically
// referenced NEXT_PUBLIC_* values. This object literal is fine to evaluate at
// import; it does not validate (and therefore never throws) here.
const rawClientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

let cachedClientEnv: ClientEnv | null = null;

function clientEnv(): ClientEnv {
  if (!cachedClientEnv) {
    cachedClientEnv = clientSchema.parse(rawClientEnv);
  }
  return cachedClientEnv;
}

/**
 * Client-safe environment. Access a property (e.g. `env.NEXT_PUBLIC_APP_URL`)
 * to trigger validation on first use. Importing this object never throws.
 */
export const env = new Proxy({} as ClientEnv, {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined;
    return clientEnv()[prop as keyof ClientEnv];
  },
}) as ClientEnv;

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
