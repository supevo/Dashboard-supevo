import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Trackable metrics an admin can base a custom challenge on. Each metric knows
 * how to count for a single user (weekly challenge) and for the whole team
 * (team challenge). Only metrics with a clean org-level aggregation are offered.
 */
export interface ChallengeMetric {
  key: string;
  label: string;
  userCount: (
    db: SupabaseClient,
    userId: string,
    orgId: string,
    since: string,
  ) => Promise<number>;
  teamCount: (db: SupabaseClient, orgId: string, since: string) => Promise<number>;
}

const head = { count: 'exact' as const, head: true };

async function n(q: PromiseLike<{ count: number | null }>): Promise<number> {
  const { count } = await q;
  return count ?? 0;
}

export const CHALLENGE_METRICS: ChallengeMetric[] = [
  {
    key: 'missions',
    label: 'Aufgaben erledigt',
    userCount: (db, u, _o, s) =>
      n(db.from('tasks').select('id', head).eq('completed_by', u).gte('completed_at', s)),
    teamCount: (db, o, s) =>
      n(
        db
          .from('tasks')
          .select('id', head)
          .eq('organization_id', o)
          .not('completed_by', 'is', null)
          .gte('completed_at', s),
      ),
  },
  {
    key: 'created',
    label: 'Aufgaben erstellt',
    userCount: (db, u, _o, s) =>
      n(db.from('tasks').select('id', head).eq('created_by', u).gte('created_at', s)),
    teamCount: (db, o, s) =>
      n(db.from('tasks').select('id', head).eq('organization_id', o).gte('created_at', s)),
  },
  {
    key: 'kudosGiven',
    label: 'Kudos vergeben',
    userCount: (db, u, _o, s) =>
      n(db.from('kudos').select('id', head).eq('from_user_id', u).gte('created_at', s)),
    teamCount: (db, o, s) =>
      n(db.from('kudos').select('id', head).eq('organization_id', o).gte('created_at', s)),
  },
  {
    key: 'ontime',
    label: 'Pünktlich erledigt',
    userCount: (db, u, _o, s) =>
      n(
        db
          .from('xp_events')
          .select('id', head)
          .eq('user_id', u)
          .eq('kind', 'ontime')
          .gte('created_at', s),
      ),
    teamCount: (db, o, s) =>
      n(
        db
          .from('xp_events')
          .select('id', head)
          .eq('organization_id', o)
          .eq('kind', 'ontime')
          .gte('created_at', s),
      ),
  },
];

export const METRIC_BY_KEY = new Map(CHALLENGE_METRICS.map((m) => [m.key, m] as const));

/** Metric list for the admin dropdown (key + label only). */
export const METRIC_OPTIONS = CHALLENGE_METRICS.map((m) => ({ key: m.key, label: m.label }));
