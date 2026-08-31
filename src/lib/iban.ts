/**
 * Shared IBAN helpers – single source of truth for cleaning, shape-checking,
 * mod-97 validation and extracting IBANs from free text. Used by the SEPA/
 * onboarding flow and by the bank-import/reconciliation code.
 */

/** Strips all whitespace and uppercases. Never null – returns '' for empty. */
export function cleanIban(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, '').toUpperCase();
}

/** Uppercased IBAN without spaces, if the value looks like one (shape only). */
export function normalizeIban(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = cleanIban(raw);
  // Rough shape: 2 letters + 2 check digits + 10–30 alphanumerics.
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s) ? s : null;
}

/**
 * Finds a German IBAN embedded in free text (spaced or not). German IBANs have
 * a fixed length (DE + 20 digits = 22 chars), so we match that exactly – this
 * avoids greedily swallowing trailing words that follow the IBAN in the purpose.
 */
export function extractIban(text: string | null | undefined): string | null {
  if (!text) return null;
  const compact = cleanIban(text);
  const m = compact.match(/DE\d{20}/);
  return m ? m[0] : null;
}

/**
 * Full IBAN validation: shape check plus the ISO 13616 mod-97 checksum.
 * Expects an already-cleaned (no spaces, uppercase) IBAN.
 */
export function ibanValid(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  );
  // mod-97 over the long number, digit by digit to avoid BigInt.
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}
