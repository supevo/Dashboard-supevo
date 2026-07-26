import { berlinToday } from '@/lib/time';

/** Monday (ISO) of the week containing `iso` (defaults to Berlin today). */
export function weekStartOf(iso: string = berlinToday()): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** The Monday `weeks` weeks before the current one. */
export function weekStartBefore(weeks: number): string {
  const d = new Date(`${weekStartOf()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - weeks * 7);
  return d.toISOString().slice(0, 10);
}
