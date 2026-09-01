/**
 * Reine Status-Helfer der Kundenanfragen (Client- und Server-nutzbar – kein
 * 'server-only', damit auch Client-Komponenten sie importieren können).
 */
export type InquiryStatus =
  // Aktuelle Vertriebs-Pipeline:
  | 'new'
  | 'not_reached'
  | 'reached'
  | 'appointment'
  | 'offer'
  | 'won'
  | 'lost'
  // Legacy (Bestandsdaten, werden in der UI gemappt):
  | 'called'
  | 'mailed'
  | 'done';

/** Aktive Pipeline-Spalten (ohne Legacy) in Reihenfolge. */
export const INQUIRY_PIPELINE: InquiryStatus[] = [
  'new',
  'not_reached',
  'reached',
  'appointment',
  'offer',
  'won',
  'lost',
];

/** Bildet Legacy-Status auf die neue Pipeline-Spalte ab (für Anzeige/Bucketing). */
export function inquiryStatusBucket(status: InquiryStatus): InquiryStatus {
  if (status === 'called' || status === 'mailed') return 'reached';
  if (status === 'done') return 'won';
  return status;
}
