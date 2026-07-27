/**
 * Named leagues (tiers) derived from a user's lifetime points. Coarser than the
 * 100-point levels, so climbing a league feels like a real milestone. Names are
 * easy to rename here without touching the rest of the app.
 */
export interface League {
  key: string;
  name: string;
  min: number; // inclusive lower bound in lifetime points
  color: string; // accent (hex), used for the badge dot/ring
  emoji: string;
}

export const LEAGUES: League[] = [
  { key: 'bronze', name: 'Bronze', min: 0, color: '#b45309', emoji: '🥉' },
  { key: 'silber', name: 'Silber', min: 100, color: '#94a3b8', emoji: '🥈' },
  { key: 'gold', name: 'Gold', min: 300, color: '#eab308', emoji: '🥇' },
  { key: 'platin', name: 'Platin', min: 600, color: '#22d3ee', emoji: '💠' },
  { key: 'saphir', name: 'Saphir', min: 1000, color: '#3b82f6', emoji: '🔷' },
  { key: 'rubin', name: 'Rubin', min: 1500, color: '#e11d48', emoji: '🔴' },
  { key: 'smaragd', name: 'Smaragd', min: 2200, color: '#10b981', emoji: '🟢' },
  { key: 'meister', name: 'Meister', min: 3000, color: '#a855f7', emoji: '👑' },
];

export interface LeagueStanding {
  current: League;
  next: League | null;
  /** Progress toward the next league, 0–100 (100 when already top). */
  progressPct: number;
  /** Points still needed for the next league (0 when top). */
  toNext: number;
}

/** Resolves the league standing for a lifetime point total. */
export function leagueForPoints(points: number): LeagueStanding {
  let idx = 0;
  for (let i = 0; i < LEAGUES.length; i++) {
    if (points >= LEAGUES[i]!.min) idx = i;
  }
  const current = LEAGUES[idx]!;
  const next = LEAGUES[idx + 1] ?? null;
  if (!next) return { current, next: null, progressPct: 100, toNext: 0 };
  const span = next.min - current.min;
  const into = points - current.min;
  return {
    current,
    next,
    progressPct: Math.max(0, Math.min(100, Math.round((into / span) * 100))),
    toNext: Math.max(0, next.min - points),
  };
}
