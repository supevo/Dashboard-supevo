/**
 * Named leagues (tiers) derived from a user's lifetime points, with divisions
 * inside each non-apex league (IV = entry … I = top, like the referenced rank
 * ladder). The three apex leagues (Meister/Großmeister/Herausforderer) have no
 * divisions. Names/colours are easy to rename here without touching the rest of
 * the app.
 */
export interface League {
  key: string;
  name: string;
  min: number; // inclusive lower bound in lifetime points
  color: string; // accent (hex), used for the badge dot/ring
  emoji: string;
  /** Number of divisions inside this league (0 = apex, no divisions). */
  divisions: number;
  /** Custom uploaded icon URL for this org (overrides the emoji), or null. */
  iconUrl?: string | null;
}

// Schwellen bewusst weit gestreckt und nach oben steiler, damit der Aufstieg
// langsam ist: die Spitze (Meister/Großmeister/Herausforderer) ist ein
// Langzeit-Ziel und kein „nach 3 Jahren durch". Punkte = Kudos + XP über die
// gesamte Zeit. Nur diese Werte ändern die Geschwindigkeit.
export const LEAGUES: League[] = [
  { key: 'eisen', name: 'Eisen', min: 0, color: '#6b7280', emoji: '⚙️', divisions: 4 },
  { key: 'bronze', name: 'Bronze', min: 500, color: '#b45309', emoji: '🥉', divisions: 4 },
  { key: 'silber', name: 'Silber', min: 1300, color: '#94a3b8', emoji: '🥈', divisions: 4 },
  { key: 'gold', name: 'Gold', min: 2600, color: '#eab308', emoji: '🥇', divisions: 4 },
  { key: 'platin', name: 'Platin', min: 4400, color: '#22d3ee', emoji: '💠', divisions: 4 },
  { key: 'smaragd', name: 'Smaragd', min: 7000, color: '#10b981', emoji: '🟢', divisions: 4 },
  { key: 'diamant', name: 'Diamant', min: 10500, color: '#3b82f6', emoji: '🔷', divisions: 4 },
  { key: 'meister', name: 'Meister', min: 15000, color: '#a855f7', emoji: '👑', divisions: 0 },
  { key: 'grossmeister', name: 'Großmeister', min: 22000, color: '#ef4444', emoji: '🔥', divisions: 0 },
  { key: 'herausforderer', name: 'Herausforderer', min: 32000, color: '#f59e0b', emoji: '🏆', divisions: 0 },
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

export interface LeagueStanding {
  current: League;
  next: League | null;
  /** Progress toward the next league, 0–100 (100 when already top). */
  progressPct: number;
  /** Points still needed for the next league (0 when top). */
  toNext: number;
  /** Division within the current league: 1 (top) … league.divisions; null for apex. */
  division: number | null;
  /** Roman numeral for the division ('I'…'IV'), or '' for apex leagues. */
  divisionRoman: string;
  /** Full display label, e.g. "Diamant II" or "Meister". */
  label: string;
}

export interface LeagueOverride {
  symbol: string | null;
  hasImage: boolean;
}

/** Applies an org's custom emoji/image override to a single league. */
function applyOverride(league: League, ov: LeagueOverride | undefined): League {
  if (!ov) return league;
  return {
    ...league,
    emoji: ov.symbol ?? league.emoji,
    iconUrl: ov.hasImage ? `/api/league-icons/${league.key}` : null,
  };
}

/**
 * Returns a copy of the standing with the current/next league symbol replaced by
 * the org's custom emoji or uploaded image where set. Defaults stay when unset.
 */
export function withSymbols(
  standing: LeagueStanding,
  overrides: Record<string, LeagueOverride>,
): LeagueStanding {
  return {
    ...standing,
    current: applyOverride(standing.current, overrides[standing.current.key]),
    next: standing.next
      ? applyOverride(standing.next, overrides[standing.next.key])
      : null,
  };
}

/** Resolves the league standing (incl. division) for a lifetime point total. */
export function leagueForPoints(points: number): LeagueStanding {
  let idx = 0;
  for (let i = 0; i < LEAGUES.length; i++) {
    if (points >= LEAGUES[i]!.min) idx = i;
  }
  const current = LEAGUES[idx]!;
  const next = LEAGUES[idx + 1] ?? null;
  const span = next ? next.min - current.min : 0;
  const into = points - current.min;

  let division: number | null = null;
  let divisionRoman = '';
  if (current.divisions > 0 && next && span > 0) {
    const frac = Math.max(0, Math.min(0.999999, into / span));
    const fromBottom = Math.floor(frac * current.divisions); // 0 … divisions-1
    const romanValue = current.divisions - fromBottom; // divisions (entry) … 1 (top)
    division = romanValue;
    divisionRoman = ROMAN[romanValue - 1] ?? String(romanValue);
  }
  const label = divisionRoman ? `${current.name} ${divisionRoman}` : current.name;

  if (!next) {
    return { current, next: null, progressPct: 100, toNext: 0, division, divisionRoman, label };
  }
  return {
    current,
    next,
    progressPct: Math.max(0, Math.min(100, Math.round((into / span) * 100))),
    toNext: Math.max(0, next.min - points),
    division,
    divisionRoman,
    label,
  };
}
