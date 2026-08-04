// Client-safe birthday helpers (no server-only imports).

/** Loot tier granted on a birthday. */
export const BIRTHDAY_BOX_TIER = 'rare' as const;

/** The Happy-Birthday badge shown in the Level Hub on the day itself. */
export const BIRTHDAY_BADGE = {
  key: 'birthday_today',
  emoji: '🎂',
  name: 'Happy Birthday',
} as const;

/** Festive title-image (banner) auto-applied in the hub on the birthday. */
export const BIRTHDAY_BANNER_KEY = 'birthday';
export const BIRTHDAY_BANNER_GRADIENT =
  'linear-gradient(120deg, #db2777 0%, #f59e0b 45%, #8b5cf6 100%)';

/** 'MM-DD' part of an ISO date, or null. */
export function monthDay(iso: string | null | undefined): string | null {
  return iso && iso.length >= 10 ? iso.slice(5, 10) : null;
}

/**
 * True when `dob` (YYYY-MM-DD) falls on `todayIso` (YYYY-MM-DD, Berlin) by
 * day and month. Year is ignored on purpose — it's the recurring birthday.
 */
export function isBirthdayOn(
  dob: string | null | undefined,
  todayIso: string,
): boolean {
  const md = monthDay(dob);
  return md !== null && md === todayIso.slice(5, 10);
}
