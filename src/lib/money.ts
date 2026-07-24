/**
 * Money helpers. Amounts are stored as integer cents to avoid float rounding.
 */

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

/** Formats integer cents as a German euro string, e.g. 475000 -> "4.750,00 €". */
export function formatEuroCents(cents: number): string {
  return EUR.format((cents ?? 0) / 100);
}

/** Formats cents as a plain decimal for inputs, e.g. 475000 -> "4750.00". */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

/**
 * Parses a user-entered euro amount into integer cents. Accepts German
 * ("4.750,00") and plain ("4750", "4750.50") notations. Returns null when the
 * input is not a valid non-negative number.
 */
export function parseEuroToCents(input: string): number | null {
  if (input == null) return null;
  let s = String(input).trim().replace(/€/g, '').replace(/\s/g, '');
  if (s === '') return null;

  if (s.includes(',')) {
    // German: comma is the decimal separator, dots are thousands separators.
    s = s.replace(/\./g, '').replace(',', '.');
  }
  if (!/^-?\d*\.?\d*$/.test(s)) return null;

  const value = Number.parseFloat(s);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
