import type { ParseResult, BankStatementFormat } from './types';
import { parseBankCsv } from './csv';
import { parseCamt053 } from './camt';
import { parseMt940 } from './mt940';

/** Detects the bank-statement format from the decoded text. */
export function detectFormat(text: string): BankStatementFormat {
  const head = text.slice(0, 4000);
  if (/<\?xml|<(?:\w+:)?Document\b/.test(head) && /Ntry|camt\.053/i.test(text)) {
    return 'camt053';
  }
  // MT940 uses :20: (reference) and :61: (statement) tag markers.
  if (/(^|\n):20:/.test(text) && /(^|\n):61:/.test(text)) return 'mt940';
  if (text.includes(';') || /\r?\n/.test(text)) return 'csv';
  return 'unknown';
}

/** Parses a decoded bank statement, auto-detecting the format. */
export function parseBankStatement(text: string): ParseResult {
  switch (detectFormat(text)) {
    case 'camt053':
      return parseCamt053(text);
    case 'mt940':
      return parseMt940(text);
    case 'csv':
      return parseBankCsv(text);
    default:
      return { transactions: [], accountIban: null, format: 'unknown' };
  }
}

/**
 * Decodes raw file bytes to text, handling the Windows-1252 encoding that German
 * bank CSVs commonly use (UTF-8 first; if it produced replacement characters,
 * fall back to windows-1252 so "Ã¼" becomes "ü").
 */
export function decodeStatementBytes(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (utf8.includes('�')) {
    try {
      return new TextDecoder('windows-1252').decode(bytes);
    } catch {
      return utf8;
    }
  }
  return utf8;
}
