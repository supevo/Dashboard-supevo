import {
  type ParsedTransaction,
  type ParseResult,
  germanAmountToCents,
  normalizeDate,
  cleanText,
} from './types';

interface Field {
  tag: string;
  value: string;
}

/** Splits an MT940 document into :NN: fields, joining continuation lines. */
function splitFields(text: string): Field[] {
  const lines = text.split(/\r?\n/);
  const fields: Field[] = [];
  let cur: Field | null = null;
  for (const line of lines) {
    const m = line.match(/^:(\d{2}[A-Z]?):(.*)$/);
    if (m) {
      if (cur) fields.push(cur);
      cur = { tag: m[1]!, value: m[2] ?? '' };
    } else if (cur) {
      cur.value += `\n${line}`;
    }
  }
  if (cur) fields.push(cur);
  return fields;
}

/** Parses the :61: statement line into date, sign and amount (cents). */
function parseLine61(value: string): { datum: string | null; betragCents: number | null } {
  const m = value.match(/^(\d{6})(\d{4})?(RC|RD|C|D)([\d.,]+)/);
  if (!m) return { datum: null, betragCents: null };
  const datum = normalizeDate(m[1]!);
  const mark = m[3]!;
  const magnitude = germanAmountToCents(m[4]!);
  if (magnitude == null) return { datum, betragCents: null };
  // C = credit (+), D = debit (-). A leading R marks a reversal → invert.
  let positive = mark.endsWith('C');
  if (mark.startsWith('R')) positive = !positive;
  return { datum, betragCents: positive ? Math.abs(magnitude) : -Math.abs(magnitude) };
}

/** Parses the :86: details for counterparty name and purpose. */
function parseLine86(value: string): { gegen: string | null; zweck: string | null } {
  const flat = value.replace(/\n/g, '');
  if (flat.includes('?')) {
    const parts = flat.split('?').slice(1); // first chunk is the type code
    const byCode = new Map<string, string[]>();
    for (const p of parts) {
      const code = p.slice(0, 2);
      const content = p.slice(2);
      const arr = byCode.get(code) ?? [];
      arr.push(content);
      byCode.set(code, arr);
    }
    const collect = (codes: string[]): string | null =>
      cleanText(
        codes
          .flatMap((c) => byCode.get(c) ?? [])
          .join(' '),
      );
    const purposeCodes = ['20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '60', '61', '62', '63'];
    const nameCodes = ['32', '33'];
    return { gegen: collect(nameCodes), zweck: collect(purposeCodes) };
  }
  // No structured subfields: strip a leading numeric type code, use as purpose.
  return { gegen: null, zweck: cleanText(flat.replace(/^\d{3}/, '')) };
}

/**
 * Parses an MT940 (SWIFT) bank statement. Each :61: line becomes a transaction;
 * the following :86: line supplies the counterparty (?32/?33) and purpose
 * (?20–?29). :25: exposes the account IBAN/number.
 */
export function parseMt940(text: string): ParseResult {
  const fields = splitFields(text);
  const accountIban = cleanText(
    fields.find((f) => f.tag === '25')?.value.replace(/\n/g, '') ?? null,
  );

  const transactions: ParsedTransaction[] = [];
  let pending: ParsedTransaction | null = null;
  for (const f of fields) {
    if (f.tag === '61') {
      if (pending) transactions.push(pending);
      const { datum, betragCents } = parseLine61(f.value);
      pending =
        datum && betragCents != null
          ? { datum, gegen: null, zweck: null, betragCents }
          : null;
    } else if (f.tag === '86' && pending) {
      const { gegen, zweck } = parseLine86(f.value);
      pending.gegen = gegen;
      pending.zweck = zweck;
    }
  }
  if (pending) transactions.push(pending);

  return { transactions, accountIban, format: 'mt940' };
}
