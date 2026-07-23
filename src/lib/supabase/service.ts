import { createClient } from '@supabase/supabase-js';
import { env, serverEnv } from '@/lib/env';
import type { Database } from '@/lib/database.types';

/**
 * Privileged Supabase client using the service-role key. BYPASSES Row Level
 * Security.
 *
 * Use ONLY in trusted server contexts and ALWAYS after an explicit
 * authorization check in the calling server action. Never import this into
 * client components. The service-role key is validated lazily and throws if
 * accessed in the browser.
 */
export function createSupabaseServiceClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = serverEnv();

  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
