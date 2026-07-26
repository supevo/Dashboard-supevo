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

/** Level thresholds from cumulative points. */
export function levelForPoints(points: number): { level: number; next: number } {
  const level = Math.floor(points / 100) + 1;
  const next = level * 100; // points needed for the next level
  return { level, next };
}
