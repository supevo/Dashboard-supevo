/** One normalized bank transaction, produced by every statement parser. */
export interface ParsedTransaction {
  /** ISO date (YYYY-MM-DD) of the booking. */
  datum: string;
  /** Counterparty name, if the format carries one. */
  gegen: string | null;
  /** Purpose / Verwendungszweck. */
  zweck: string | null;
  /** Amount in cents: > 0 incoming, < 0 outgoing. */
  betragCents: number;
  /** IBAN of the counterparty (Zahler/Empfänger), if the statement carries one. */
  gegenIban?: string | null;
}

export interface ParseResult {
  transactions: ParsedTransaction[];
  /** IBAN of the statement's own account, if the format exposes it. */
  accountIban: string | null;
  /** Detected format, for logging. */
  format: BankStatementFormat;
}

export type BankStatementFormat = 'csv' | 'camt053' | 'mt940' | 'unknown';

/** Parses a German amount ("1.234,56" or "-1.234,56" or "1234.56") to cents. */
export function germanAmountToCents(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  // Trailing sign ("1.234,56-") used by some exports.
  let sign = 1;
  if (s.endsWith('-')) {
    sign = -1;
    s = s.slice(0, -1).trim();
  } else if (s.startsWith('-')) {
    sign = -1;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim();
  }
  // German format: '.' thousands, ',' decimals. If only '.' is present and it
  // looks like a decimal separator (two trailing digits), treat it as decimal.
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) * sign;
}

/** Normalizes a date from common German/ISO shapes to YYYY-MM-DD. */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // ISO already.
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD.MM.YYYY or DD.MM.YY
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) {
    const d = m[1]!.padStart(2, '0');
    const mo = m[2]!.padStart(2, '0');
    let y = m[3]!;
    if (y.length === 2) y = Number(y) >= 70 ? `19${y}` : `20${y}`;
    return `${y}-${mo}-${d}`;
  }
  // YYMMDD (MT940 :61:)
  m = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (m) {
    const yy = Number(m[1]);
    const y = yy >= 70 ? `19${m[1]}` : `20${m[1]}`;
    return `${y}-${m[2]}-${m[3]}`;
  }
  return null;
}

/** Collapses whitespace and trims; returns null for empty. */
export function cleanText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, ' ').trim();
  return s.length ? s : null;
}

// IBAN helpers live in the shared module; re-exported here so existing
// bank-import importers keep working from one canonical implementation.
export { normalizeIban, extractIban } from '@/lib/iban';
