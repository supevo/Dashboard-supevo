export interface Badge {
  key: string;
  emoji: string;
  label: string;
  points: number;
}

/** Predefined kudos badges. `key` is the stored value. */
export const BADGES: Badge[] = [
  { key: 'macher', emoji: '🚀', label: 'Macher', points: 15 },
  { key: 'teamplayer', emoji: '🤝', label: 'Teamplayer', points: 10 },
  { key: 'ideengeber', emoji: '💡', label: 'Ideengeber', points: 10 },
  { key: 'qualitaet', emoji: '✨', label: 'Qualität', points: 10 },
  { key: 'retter', emoji: '🦸', label: 'Retter in der Not', points: 20 },
  { key: 'kunde', emoji: '⭐', label: 'Kundenliebling', points: 15 },
];

export const BADGE_BY_KEY = new Map(BADGES.map((b) => [b.key, b] as const));

export function badgeLabel(key: string): string {
  const b = BADGE_BY_KEY.get(key);
  return b ? `${b.emoji} ${b.label}` : key;
}

/**
 * Progressive level curve: each level costs more XP than the one before, so
 * higher levels take longer. Level L → L+1 needs `BASE + (L-1)*STEP` points.
 */
const LEVEL_BASE = 100;
const LEVEL_STEP = 20;

/** XP needed to advance FROM `level` to `level + 1`. */
function levelRequirement(level: number): number {
  return LEVEL_BASE + (level - 1) * LEVEL_STEP;
}

export interface LevelInfo {
  level: number;
  next: number; // cumulative points needed to reach the next level
  levelStart: number; // cumulative points at the start of the current level
  intoLevel: number; // points earned within the current level
  span: number; // points needed to complete the current level
  progressPct: number; // 0..100 within the current level
}

/** Level + progress from cumulative points, using the progressive curve. */
export function levelForPoints(points: number): LevelInfo {
  const p = Math.max(0, points);
  let level = 1;
  let start = 0;
  // Advance while the current level's requirement is fully covered.
  while (p >= start + levelRequirement(level)) {
    start += levelRequirement(level);
    level += 1;
  }
  const span = levelRequirement(level);
  const intoLevel = p - start;
  return {
    level,
    next: start + span,
    levelStart: start,
    intoLevel,
    span,
    progressPct: Math.max(0, Math.min(100, Math.round((intoLevel / span) * 100))),
  };
}
