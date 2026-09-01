import { formatBerlinTime } from '@/lib/time';

/**
 * Verspätungs-Stufen beim Einstempeln. Die Grenzen sind fix (für alle gleich)
 * und beziehen sich auf die Europe/Berlin-Uhrzeit des ersten Stempels am Tag:
 *
 *   ≤ 08:45  →  pünktlich  (keine Stufe)
 *   08:46 – 08:50  →  minor    (kleiner XP-Abzug)
 *   08:51 – 09:00  →  major    (stärkerer XP-Abzug)
 *   > 09:00        →  critical (starker XP-Abzug + deutliche Markierung)
 */
export type LateTier = 'minor' | 'major' | 'critical';

/** Fixe Schwellen als Minuten seit Mitternacht (Berlin). */
export const ON_TIME_UNTIL_MIN = 8 * 60 + 45; // 08:45 → 525
const MINOR_UNTIL_MIN = 8 * 60 + 50; // 08:50 → 530
const MAJOR_UNTIL_MIN = 9 * 60; // 09:00 → 540

/**
 * XP-Abzug je Stufe (negativ). Referenz: ein korrekt abgeschlossener Arbeitstag
 * gibt +10 XP – eine kritische Verspätung wiegt also zwei Tagesboni auf.
 */
export const LATE_XP: Record<LateTier, number> = {
  minor: -5,
  major: -10,
  critical: -20,
};

export const LATE_LABEL: Record<LateTier, string> = {
  minor: 'leicht verspätet',
  major: 'verspätet',
  critical: 'stark verspätet',
};

/** Emoji-Ampel für die Teamradar-Markierung. */
export const LATE_EMOJI: Record<LateTier, string> = {
  minor: '🟡',
  major: '🟠',
  critical: '🔴',
};

/**
 * Grades a Berlin minutes-of-day value into a tardiness tier, or `null` when the
 * clock-in is on time (≤ 08:45). Pure – no I/O, no time-zone math (the caller
 * passes an already-Berlin minute count).
 */
export function lateTierForMinutes(berlinMinutesOfDay: number): LateTier | null {
  if (berlinMinutesOfDay <= ON_TIME_UNTIL_MIN) return null;
  if (berlinMinutesOfDay <= MINOR_UNTIL_MIN) return 'minor';
  if (berlinMinutesOfDay <= MAJOR_UNTIL_MIN) return 'major';
  return 'critical';
}

/** Employee-facing one-liner appended to the clock-in confirmation. */
export function lateNoticeText(tier: LateTier, clockInIso: string): string {
  return `Verspätung um ${formatBerlinTime(clockInIso)} Uhr – ${LATE_XP[tier]} XP.`;
}
