/**
 * Company-tenure formatting + seniority badges. Shared by the Level Hub and the
 * colleague profile so both show the same wording and the current milestone.
 */

const MONTH = 30.44;
const YEAR = 365.25;

/**
 * Human tenure string, scaled by magnitude:
 * - under 6 months → days ("142 Tage")
 * - 6–12 months → months ("8 Monate")
 * - 1 year and up → years + months ("2 Jahre 3 Monate", "1 Jahr")
 */
export function formatTenure(days: number): string {
  if (days < 182) return `${days} ${days === 1 ? 'Tag' : 'Tage'}`;
  if (days < 365) {
    const m = Math.max(1, Math.floor(days / MONTH));
    return `${m} ${m === 1 ? 'Monat' : 'Monate'}`;
  }
  const years = Math.floor(days / YEAR);
  const remMonths = Math.floor((days - years * YEAR) / MONTH);
  const y = `${years} ${years === 1 ? 'Jahr' : 'Jahre'}`;
  if (remMonths <= 0) return y;
  return `${y} ${remMonths} ${remMonths === 1 ? 'Monat' : 'Monate'}`;
}

export interface TenureBadge {
  minDays: number;
  name: string;
  emoji: string;
}

/**
 * Service-anniversary milestones, ascending. Each year has its own badge with
 * a distinctive name (not just "X Jahre dabei"). The tenure in years is still
 * shown separately via formatTenure().
 */
export const TENURE_BADGES: TenureBadge[] = [
  { minDays: 182, name: 'Frisch eingezogen', emoji: '🌱' },
  { minDays: 365, name: 'Wurzeln geschlagen', emoji: '🌿' },
  { minDays: 730, name: 'Fest verwachsen', emoji: '🌳' },
  { minDays: 1096, name: 'Eingespieltes Zahnrad', emoji: '⚙️' },
  { minDays: 1461, name: 'Fels in der Brandung', emoji: '🪨' },
  { minDays: 1826, name: 'Alter Hase', emoji: '🎖️' },
  { minDays: 2192, name: 'Urgestein', emoji: '🗿' },
  { minDays: 2557, name: 'Anker der Crew', emoji: '⚓' },
  { minDays: 2922, name: 'Leuchtturm', emoji: '🗼' },
  { minDays: 3287, name: 'Lebende Institution', emoji: '🏛️' },
  { minDays: 3652, name: 'Lebende Legende', emoji: '💎' },
];

/** The highest tenure milestone reached, or null when under six months. */
export function currentTenureBadge(days: number): TenureBadge | null {
  let badge: TenureBadge | null = null;
  for (const b of TENURE_BADGES) {
    if (days >= b.minDays) badge = b;
  }
  return badge;
}
