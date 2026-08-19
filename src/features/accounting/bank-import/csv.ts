import {
  type ParsedTransaction,
  type ParseResult,
  germanAmountToCents,
  normalizeDate,
  cleanText,
  normalizeIban,
  extractIban,
} from './types';

/** Splits one delimited line into fields, honoring double-quoted values. */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((f) => f.trim().replace(/^"|"$/g, '').trim());
}

const DATE_KEYS = ['buchungstag', 'buchungsdatum', 'datum', 'valuta', 'valutadatum'];
const NAME_KEYS = [
  'beguenstigter',
  'begünstigter',
  'zahlungsempfaenger',
  'zahlungsempfänger',
  'auftraggeber',
  'zahlungspflichtiger',
  'name',
  'empfaenger',
  'empfänger',
  'beguenstigter/zahlungspflichtiger',
];
const PURPOSE_KEYS = ['verwendungszweck', 'buchungstext', 'vorgang/verwendungszweck', 'zweck'];
const AMOUNT_KEYS = ['betrag', 'umsatz', 'betrag (eur)', 'betrag(eur)'];
const SOLL_KEYS = ['soll'];
const HABEN_KEYS = ['haben'];
const SIGN_KEYS = ['soll/haben', 'soll/haben-kennzeichen', 's/h', 'haben/soll'];
// IBAN of the counterparty. Avoid the own-account column ("iban auftragskonto").
const IBAN_KEYS = [
  'iban zahlungsbeteiligter',
  'iban auftraggeber',
  'iban empfaenger',
  'iban empfänger',
  'iban zahlungspflichtiger',
  'kontonummer/iban',
  'iban/bic',
  'empfaenger iban',
  'empfänger iban',
  'auftraggeber iban',
];

function findIndex(headers: string[], keys: string[]): number {
  return headers.findIndex((h) => keys.includes(h));
}
function findIndexIncludes(headers: string[], keys: string[]): number {
  return headers.findIndex((h) => keys.some((k) => h.includes(k)));
}

/**
 * Parses a German bank CSV export. Handles: a leading block of meta lines before
 * the header, semicolon (or comma) delimiter, quoted fields, a single "Betrag"
 * column OR separate Soll/Haben columns OR "Betrag" + a Soll/Haben indicator,
 * and the "Verwendungszweck before Buchungstext" preference.
 */
export function parseBankCsv(text: string): ParseResult {
  const rawLines = text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  const delim = (text.match(/;/g)?.length ?? 0) >= (text.match(/,/g)?.length ?? 0)
    ? ';'
    : ',';

  // Find the header row: the first line that carries a date column and either an
  // amount or a Soll/Haben column.
  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const cols = splitLine(rawLines[i]!, delim).map((c) => c.toLowerCase());
    const hasDate = findIndexIncludes(cols, DATE_KEYS) >= 0;
    const hasAmount =
      findIndexIncludes(cols, AMOUNT_KEYS) >= 0 ||
      findIndex(cols, SOLL_KEYS) >= 0 ||
      findIndex(cols, HABEN_KEYS) >= 0;
    if (hasDate && hasAmount) {
      headerIdx = i;
      headers = cols;
      break;
    }
  }
  if (headerIdx < 0) {
    return { transactions: [], accountIban: null, format: 'csv' };
  }

  const dateI = findIndexIncludes(headers, DATE_KEYS);
  const nameI = findIndexIncludes(headers, NAME_KEYS);
  const purposeI = findIndexIncludes(headers, PURPOSE_KEYS);
  const amountI = findIndexIncludes(headers, AMOUNT_KEYS);
  const sollI = findIndex(headers, SOLL_KEYS);
  const habenI = findIndex(headers, HABEN_KEYS);
  const signI = findIndexIncludes(headers, SIGN_KEYS);
  let ibanI = findIndexIncludes(headers, IBAN_KEYS);
  // Generic "iban" column, but never the statement's own-account IBAN column.
  if (ibanI < 0) {
    ibanI = headers.findIndex(
      (h) => h.includes('iban') && !h.includes('auftragskonto') && !h.includes('eigen'),
    );
  }

  const transactions: ParsedTransaction[] = [];
  for (let i = headerIdx + 1; i < rawLines.length; i += 1) {
    const cols = splitLine(rawLines[i]!, delim);
    if (cols.length < 2) continue;

    const datum = dateI >= 0 ? normalizeDate(cols[dateI] ?? '') : null;
    if (!datum) continue;

    let betragCents: number | null = null;
    if (amountI >= 0) {
      betragCents = germanAmountToCents(cols[amountI] ?? '');
      // Apply an explicit Soll/Haben indicator if the amount is unsigned.
      if (betragCents != null && signI >= 0) {
        const sign = (cols[signI] ?? '').trim().toUpperCase();
        if (sign.startsWith('S')) betragCents = -Math.abs(betragCents);
        else if (sign.startsWith('H')) betragCents = Math.abs(betragCents);
      }
    } else if (sollI >= 0 || habenI >= 0) {
      const soll = sollI >= 0 ? germanAmountToCents(cols[sollI] ?? '') : null;
      const haben = habenI >= 0 ? germanAmountToCents(cols[habenI] ?? '') : null;
      if (haben) betragCents = Math.abs(haben);
      else if (soll) betragCents = -Math.abs(soll);
    }
    if (betragCents == null) continue;

    const zweck = purposeI >= 0 ? cleanText(cols[purposeI]) : null;
    const gegenIban =
      (ibanI >= 0 ? normalizeIban(cols[ibanI]) : null) ??
      // Fallback: an IBAN embedded in the purpose text.
      extractIban(zweck);

    transactions.push({
      datum,
      gegen: nameI >= 0 ? cleanText(cols[nameI]) : null,
      zweck,
      betragCents,
      gegenIban,
    });
  }

  return { transactions, accountIban: null, format: 'csv' };
}
